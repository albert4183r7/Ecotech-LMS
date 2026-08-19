import ZAI from "z-ai-web-dev-sdk";
import type { CreateChatCompletionBody, ChatMessage } from "z-ai-web-dev-sdk";
import { z } from "zod/v4";

// ============================================
// General-purpose LLM client wrapper
// Uses z-ai-web-dev-sdk → Zhipu GLM models
// Server-only — never import on the client.
// ============================================

/** Model name constant — change here to swap the underlying model. */
export const LLM_MODEL = "glm-4-plus";

// ────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────

/** Build a ZAI client (reads .z-ai-config automatically). */
async function getClient() {
  return ZAI.create();
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

  // Rate-limit detection
  if (/429|rate.?limit|too many/i.test(msg)) {
    throw new Error(
      `[LLM Rate Limited] ${context} — the API returned a rate-limit error. Please retry after a brief wait.`,
    );
  }

  // Auth / config detection
  if (/401|403|unauthorized|forbidden|api.?key/i.test(msg)) {
    throw new Error(
      `[LLM Auth Error] ${context} — check that .z-ai-config contains a valid apiKey.`,
    );
  }

  // Generic API error (non-2xx)
  if (/status \d{3}/i.test(msg)) {
    throw new Error(`[LLM API Error] ${context} — ${msg}`);
  }

  throw new Error(`[LLM Error] ${context} — ${msg}`);
}

// ────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────

/**
 * Call the LLM with `response_format: { type: "json_object" }` and validate
 * the returned JSON against a Zod schema.
 *
 * **Strategy:** The Zhipu GLM API supports `json_object` mode but NOT the
 * `json_schema` structured-output variant (it is silently ignored). So we:
 *   1. Include the desired JSON shape in the system-prompt text.
 *   2. Send `response_format: { type: "json_object" }` to force JSON output.
 *   3. Parse the response and validate with Zod.
 *   4. Throw a descriptive error on schema mismatch.
 */
const MAX_RETRIES = 2;

export async function generateStructuredJSON<T>(
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const exampleHint = buildExampleHint(schema);
  const fieldDescription = buildFieldDescription(schema);

  const systemPrompt = `You are a helpful assistant. You MUST return a single JSON object as your response. Do NOT return a JSON schema, do NOT return an array of schemas, and do NOT include markdown fences.

REQUIRED JSON structure:
${fieldDescription}

EXAMPLE of the exact format to follow:
${exampleHint}

IMPORTANT RULES:
1. Return ONLY the actual data JSON object — never the schema definition itself.
2. Do NOT include fields like "type", "properties", "items" — those are schema metadata, not data.
3. Every field described above must be present with the correct type.
4. No markdown fences (no \`\`\`json), no explanation text, no extra commentary.`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const client = await getClient();
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    const body: CreateChatCompletionBody = {
      model: LLM_MODEL,
      messages,
      response_format: { type: "json_object" } as never,
      thinking: { type: "disabled" },
    };

    let rawContent: string;
    try {
      const result = await client.chat.completions.create(body);
      rawContent = result?.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      throwFriendlyError(err, "generateStructuredJSON");
    }

    if (!rawContent.trim()) {
      lastError = new Error(
        "[LLM Error] generateStructuredJSON — the model returned an empty response.",
      );
      console.error(`[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: empty response, retrying...`);
      continue;
    }

    // Strip markdown fences if the model wraps the response
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    // Parse raw JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      lastError = new Error(
        `[LLM Error] generateStructuredJSON — the model returned invalid JSON. Raw response:\n${rawContent.slice(0, 500)}`,
      );
      console.error(`[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: invalid JSON, retrying...`);
      continue;
    }

    // Detect if the model returned a schema instead of data
    if (isLikelySchema(parsed)) {
      lastError = new Error(
        "[LLM Schema Error] generateStructuredJSON — the model returned a JSON schema definition instead of actual data.",
      );
      console.error(`[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: model returned schema instead of data, retrying...`);
      continue;
    }

    // Validate against the Zod schema
    const result = schema.safeParse(parsed);
    if (result.success) {
      return result.data as T;
    }

    // Validation failed — retry if attempts remain
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    lastError = new Error(
      `[LLM Schema Error] generateStructuredJSON — the model response does not match the expected schema.\n\nValidation issues:\n${issues}\n\nReceived data (first 500 chars):\n${JSON.stringify(parsed, null, 2).slice(0, 500)}`,
    );
    console.error(`[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: schema validation failed, retrying...\n${issues}`);
  }

  // All retries exhausted
  throw lastError ?? new Error("generateStructuredJSON failed after all retries.");
}

/**
 * Stream text from the LLM. Yields string chunks as they arrive.
 *
 * Uses `stream: true` which returns a `ReadableStream<Uint8Array>` of
 * OpenAI-compatible SSE lines. Each chunk's text is at
 * `choices[0].delta.content`.
 */
export async function* streamText(
  prompt: string,
  options?: {
    systemPrompt?: string;
    model?: string;
  },
): AsyncGenerator<string, void, undefined> {
  const client = await getClient();

  const messages: ChatMessage[] = [];
  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const body: CreateChatCompletionBody = {
    model: options?.model ?? LLM_MODEL,
    messages,
    stream: true,
    thinking: { type: "disabled" },
  };

  let stream: ReadableStream<Uint8Array>;
  try {
    const result = await client.chat.completions.create(body);
    if (!(result instanceof ReadableStream)) {
      throw new Error("Expected a ReadableStream from the streaming API call.");
    }
    stream = result;
  } catch (err) {
    throwFriendlyError(err, "streamText");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("data: ")) {
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data);
            const content: string | undefined = parsed?.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // Non-JSON line — skip silently (e.g. keep-alive comment)
          }
        }
      }
    }

    // Flush any remaining buffer content
    if (buffer.trim() && buffer.trim() !== "[DONE]") {
      try {
        const parsed = JSON.parse(buffer.trim().replace(/^data: /, ""));
        const content: string | undefined = parsed?.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // Ignore incomplete final chunk
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ────────────────────────────────────────────────
// Schema → example & description builders
// ────────────────────────────────────────────────

/** Build a human-readable field description from a Zod schema */
function buildFieldDescription(zodType: z.ZodType, indent: string = ""): string {
  if (zodType instanceof z.ZodObject) {
    const lines: string[] = ["An object with these fields:"];
    for (const [key, val] of Object.entries(zodType.shape)) {
      const typeDesc = describeType(val);
      lines.push(`${indent}  - "${key}": ${typeDesc}`);
    }
    return lines.join("\n");
  }
  return describeType(zodType);
}

/** Build a concrete example JSON from a Zod schema */
function buildExampleHint(zodType: z.ZodType): string {
  const example = generateExample(zodType);
  return "```json\n" + JSON.stringify(example, null, 2) + "\n```";
}

/** Recursively generate example data from a Zod schema */
function generateExample(zodType: z.ZodType): unknown {
  if (zodType instanceof z.ZodObject) {
    const obj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(zodType.shape)) {
      obj[key] = generateExample(val);
    }
    return obj;
  }
  if (zodType instanceof z.ZodArray) {
    return [generateExample(zodType.element)];
  }
  if (zodType instanceof z.ZodString) return "example value";
  if (zodType instanceof z.ZodNumber) return 1;
  if (zodType instanceof z.ZodBoolean) return true;
  if (zodType instanceof z.ZodEnum) return zodType.options[0];
  return null;
}

/** Describe a Zod type in human-readable terms */
function describeType(t: z.ZodType): string {
  if (t instanceof z.ZodString) return "string (text)";
  if (t instanceof z.ZodNumber) return "number (integer or float)";
  if (t instanceof z.ZodBoolean) return "boolean (true or false)";
  if (t instanceof z.ZodEnum) return `string, must be one of: ${t.options.join(", ")}`;
  if (t instanceof z.ZodArray) {
    return `array of objects, each with: ${describeType(t.element)}`;
  }
  if (t instanceof z.ZodObject) {
    const fields = Object.entries(t.shape)
      .map(([k, v]) => `  - "${k}": ${describeType(v)}`)
      .join("\n");
    return `object with fields:\n${fields}`;
  }
  return "any";
}

/** Detect if the parsed response is a JSON Schema definition rather than actual data */
function isLikelySchema(data: unknown): boolean {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  // If it has "type" and "properties" at the top level, it's likely a schema
  if (obj.type === "object" && typeof obj.properties === "object") return true;
  if (obj.type === "array" && typeof obj.items === "object") return true;
  // If it's an array where the first element has "type" and "properties"
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    if (first.type === "object" && typeof first.properties === "object") return true;
    if (typeof first.type === "string" && typeof first.properties === "object") return true;
  }
  return false;
}
