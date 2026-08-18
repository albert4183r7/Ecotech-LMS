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
export async function generateStructuredJSON<T>(
  prompt: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const client = await getClient();

  const jsonShapeHint = buildShapeHint(schema);

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a helpful assistant that returns ONLY valid JSON.

The JSON you return MUST match this shape:
${jsonShapeHint}

Rules:
- Return ONLY a single JSON object — no markdown fences, no explanation, no extra text.
- Every field listed above must be present with the correct type.
- Do NOT add extra fields beyond what is described above.`,
    },
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
    throw new Error(
      "[LLM Error] generateStructuredJSON — the model returned an empty response.",
    );
  }

  // Parse raw JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    throw new Error(
      `[LLM Error] generateStructuredJSON — the model returned invalid JSON. Raw response:\n${rawContent.slice(0, 500)}`,
    );
  }

  // Validate against the Zod schema
  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `[LLM Schema Error] generateStructuredJSON — the model response does not match the expected schema.\n\nValidation issues:\n${issues}\n\nReceived data (first 500 chars):\n${JSON.stringify(parsed, null, 2).slice(0, 500)}`,
    );
  }

  return result.data as T;
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
// Shape-hint builder (describes a Zod schema as
// human-readable text for the system prompt)
// ────────────────────────────────────────────────

function buildShapeHint(schema: z.ZodType): string {
  // Try zod-to-json-schema first; fall back to a manual description.
  try {
    const jsonSchema = zodToJsonSchema(schema);
    return "```json\n" + JSON.stringify(jsonSchema, null, 2) + "\n```";
  } catch {
    // Fallback: use the schema's description if available
    return JSON.stringify(
      describeZodType(schema),
      null,
      2,
    );
  }
}

/** Minimal Zod → JSON Schema converter for the types we care about. */
function zodToJsonSchema(zodType: z.ZodType): Record<string, unknown> {
  if (zodType instanceof z.ZodObject) {
    const shape = zodType.shape;
    const properties: Record<string, unknown> = {};

    for (const [key, val] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(val);
    }

    return { type: "object", properties };
  }

  if (zodType instanceof z.ZodArray) {
    return { type: "array", items: zodToJsonSchema(zodType.element) };
  }

  if (zodType instanceof z.ZodString) return { type: "string" };
  if (zodType instanceof z.ZodNumber) return { type: "number" };
  if (zodType instanceof z.ZodBoolean) return { type: "boolean" };
  if (zodType instanceof z.ZodEnum) return { type: "string", enum: zodType.options };

  // Fallback
  return { type: "any" };
}

/** Fallback: describe a Zod type as a plain object (when JSON Schema fails). */
function describeZodType(zodType: z.ZodType): unknown {
  if (zodType instanceof z.ZodObject) {
    const obj: Record<string, string> = {};
    for (const [key, val] of Object.entries(zodType.shape)) {
      obj[key] = zodTypeName(val);
    }
    return obj;
  }
  return zodTypeName(zodType);
}

function zodTypeName(t: z.ZodType): string {
  if (t instanceof z.ZodString) return "string";
  if (t instanceof z.ZodNumber) return "number";
  if (t instanceof z.ZodBoolean) return "boolean";
  if (t instanceof z.ZodArray) return `${zodTypeName(t.element)}[]`;
  if (t instanceof z.ZodObject) return "object";
  if (t instanceof z.ZodEnum) return `one of: ${t.options.join(" | ")}`;
  return "any";
}
