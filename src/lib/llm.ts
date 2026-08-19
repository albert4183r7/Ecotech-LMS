import { GoogleGenAI } from "@google/genai";
import { z } from "zod/v4";

// ============================================
// General-purpose LLM client wrapper
// Google Gemini via @google/genai
// Server-only — never import on the client.
// ============================================

/** Model id. Override with GEMINI_MODEL.
 *  `gemini-flash-latest` is a rolling alias, so it does not go stale.
 *  Use `gemini-pro-latest` for higher-quality outlines at greater cost. */
export const LLM_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";

/** Generous ceiling — on Gemini 2.5+ this budget also covers thinking tokens,
 *  so a tight limit truncates the answer rather than the reasoning. */
const MAX_OUTPUT_TOKENS = 16384;

const MAX_RETRIES = 2;

// ────────────────────────────────────────────────
// Client
// ────────────────────────────────────────────────

let client: GoogleGenAI | null = null;

/** Lazily build the Gemini client from GEMINI_API_KEY. */
export function getClient(): GoogleGenAI {
  if (client) return client;

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[LLM Config Error] GEMINI_API_KEY is not set. Add it to .env — see the README.",
    );
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}

/** Extract a human-readable message from an unknown error. */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}

/** Classify an API error and throw a clean, actionable message. */
function throwFriendlyError(err: unknown, context: string): never {
  const msg = extractErrorMessage(err);

  if (/429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg)) {
    throw new Error(
      `[LLM Rate Limited] ${context} — Gemini returned a quota or rate-limit error. Retry after a brief wait.`,
    );
  }

  if (/401|403|PERMISSION_DENIED|UNAUTHENTICATED|API.?key/i.test(msg)) {
    throw new Error(
      `[LLM Auth Error] ${context} — check that GEMINI_API_KEY is set and valid.`,
    );
  }

  if (/404|NOT_FOUND/i.test(msg)) {
    throw new Error(
      `[LLM Model Error] ${context} — model "${LLM_MODEL}" was not found for this API key. Set GEMINI_MODEL to one your account can access.`,
    );
  }

  if (/socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg)) {
    throw new Error(
      `[LLM Network Error] ${context} — could not reach the Gemini API. Check connectivity and any proxy or firewall between this host and generativelanguage.googleapis.com. (${msg})`,
    );
  }

  throw new Error(`[LLM Error] ${context} — ${msg}`);
}

// ────────────────────────────────────────────────
// Structured JSON
// ────────────────────────────────────────────────

/** Convert a Zod schema to the JSON Schema Gemini accepts.
 *  The `$schema` dialect key is not part of the response-schema contract. */
function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/**
 * Generate JSON conforming to a Zod schema.
 *
 * Gemini enforces the shape natively via `responseJsonSchema`, so the response
 * is already constrained; the Zod parse is a second gate that also gives us the
 * typed value. Retries cover transient API failures and refinement misses.
 */
export async function generateStructuredJSON<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options?: {
    /** Coerce the parsed JSON before schema validation. Lets a caller fix a
     *  predictable model mistake (swapped fields, a legacy shape) instead of
     *  spending a retry on it. */
    repair?: (parsed: unknown) => unknown;
    /** Extra instruction prepended as the system instruction. */
    systemInstruction?: string;
    temperature?: number;
  },
): Promise<T> {
  const responseJsonSchema = toGeminiJsonSchema(schema);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let rawContent: string;

    try {
      const response = await getClient().models.generateContent({
        model: LLM_MODEL,
        contents: prompt,
        config: {
          systemInstruction: options?.systemInstruction,
          responseMimeType: "application/json",
          responseJsonSchema,
          temperature: options?.temperature ?? 0.4,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
        },
      });
      rawContent = response.text ?? "";
    } catch (err) {
      throwFriendlyError(err, "generateStructuredJSON");
    }

    if (!rawContent.trim()) {
      lastError = new Error(
        "[LLM Error] generateStructuredJSON — the model returned an empty response.",
      );
      console.error(
        `[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: empty response, retrying...`,
      );
      continue;
    }

    // Defensive: strip fences in case a model ignores the JSON mime type.
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      lastError = new Error(
        `[LLM Error] generateStructuredJSON — invalid JSON. Raw response:\n${rawContent.slice(0, 500)}`,
      );
      console.error(
        `[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: invalid JSON, retrying...`,
      );
      continue;
    }

    if (options?.repair) {
      try {
        parsed = options.repair(parsed);
      } catch (repairErr) {
        console.error("[generateStructuredJSON] repair() threw, using raw response:", repairErr);
      }
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data as T;

    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    lastError = new Error(
      `[LLM Schema Error] generateStructuredJSON — response does not match the expected schema.\n\nValidation issues:\n${issues}\n\nReceived (first 500 chars):\n${JSON.stringify(parsed, null, 2).slice(0, 500)}`,
    );
    console.error(
      `[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: schema validation failed, retrying...\n${issues}`,
    );
  }

  throw lastError ?? new Error("generateStructuredJSON failed after all retries.");
}

// ────────────────────────────────────────────────
// Streaming text
// ────────────────────────────────────────────────

/** Stream text from the model, yielding chunks as they arrive. */
export async function* streamText(
  prompt: string,
  options?: {
    systemPrompt?: string;
    model?: string;
    temperature?: number;
  },
): AsyncGenerator<string, void, undefined> {
  let stream: AsyncGenerator<{ text?: string }, unknown, unknown>;

  try {
    stream = (await getClient().models.generateContentStream({
      model: options?.model ?? LLM_MODEL,
      contents: prompt,
      config: {
        systemInstruction: options?.systemPrompt,
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    })) as AsyncGenerator<{ text?: string }, unknown, unknown>;
  } catch (err) {
    throwFriendlyError(err, "streamText");
  }

  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}
