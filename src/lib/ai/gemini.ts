import { z } from "zod/v4";
import { isGeminiTask, modelFor, type AiTask } from "./models";

// ============================================
// Native Gemini structured generation
//
// Disabled: structured.ts no longer imports or calls this provider. It is kept
// here, commented out at the routing point, so switching back does not require
// reconstructing the native response-schema adapter.
//
// Outline and deck generation are interactive, schema-bound jobs. Sending the
// JSON Schema to Gemini itself makes one response sufficient in the normal
// case: deterministic repair and Zod remain the local safety net, rather than
// using a second model request to fix formatting.
// ============================================

const GEMINI_API_ROOT =
  process.env.GEMINI_API_ROOT ?? "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS ?? 90_000);

export interface GeminiStructuredOptions<T> {
  task: AiTask;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  maxRetries?: number;
  repair?: (parsed: unknown) => unknown;
  images?: GeminiImageInput[];
  /** A Gemini-compatible schema when the local Zod schema uses richer unions. */
  providerSchema?: z.ZodType;
  schema: z.ZodType<T>;
}

export interface GeminiImageInput {
  /** Short context placed immediately before the image. */
  label: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data: Buffer | string;
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string; details?: unknown };
}

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;

  // Gemini accepts a deliberately small JSON Schema dialect. Zod emits
  // draft-2020 conveniences that are equivalent but rejected by the native
  // endpoint (`const` and `oneOf` are the relevant ones for discriminated
  // slide elements), so translate them without weakening local validation.
  const normalise = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalise);
    if (!value || typeof value !== "object") return value;

    const source = value as Record<string, unknown>;
    const target: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(source)) {
      if (key === "$schema") continue;
      if (key === "const") {
        target.enum = [child];
        continue;
      }
      target[key === "oneOf" ? "anyOf" : key] = normalise(child);
    }
    return target;
  };

  return normalise(jsonSchema) as Record<string, unknown>;
}

function transient(status: number, message: string): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500 ||
    /overload|timeout/i.test(message)
  );
}

function friendlyError(status: number, message: string, task: AiTask): Error {
  const model = modelFor(task);
  if (status === 401 || status === 403 || /API.?key|permission|unauth/i.test(message)) {
    return new Error(`[Gemini Auth Error] Check GEMINI_API_KEY. (${message})`);
  }
  if (status === 404 || /not found/i.test(message)) {
    return new Error(`[Gemini Model Error] Model "${model}" is unavailable. (${message})`);
  }
  if (status === 429 || /quota|rate.?limit|resource_exhausted/i.test(message)) {
    return new Error(`[Gemini Rate Limited] Retry shortly or check the Gemini quota. (${message})`);
  }
  return new Error(`[Gemini Error] ${message || `request failed with HTTP ${status}`}`);
}

function responseText(response: GeminiResponse): string {
  return (response.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

export async function generateGeminiStructured<T>(
  prompt: string,
  options: GeminiStructuredOptions<T>,
): Promise<T> {
  if (!isGeminiTask(options.task)) {
    throw new Error(`Task "${options.task}" is not configured for Gemini.`);
  }

  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("[Gemini Config Error] GEMINI_API_KEY is not set.");

  const model = modelFor(options.task);
  const endpoint = `${GEMINI_API_ROOT}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const attempts = Math.max(1, (options.maxRetries ?? 0) + 1);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: options.systemInstruction
            ? { parts: [{ text: options.systemInstruction }] }
            : undefined,
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                ...(options.images ?? []).flatMap((image) => [
                  { text: image.label },
                  {
                    inlineData: {
                      mimeType: image.mimeType,
                      data:
                        typeof image.data === "string" ? image.data : image.data.toString("base64"),
                    },
                  },
                ]),
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: jsonSchemaFor(options.providerSchema ?? options.schema),
            temperature: options.temperature ?? 0.4,
            maxOutputTokens: options.maxOutputTokens ?? 8192,
          },
        }),
      });
    } catch (error) {
      lastError = new Error(
        `[Gemini Network Error] ${error instanceof Error ? error.message : "request failed"}`,
      );
      if (attempt < attempts) continue;
      throw lastError;
    }

    const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
    if (!response.ok || payload.error) {
      const detail = payload.error?.details
        ? ` ${JSON.stringify(payload.error.details).slice(0, 1_000)}`
        : "";
      const message =
        (payload.error?.message ?? `request failed with HTTP ${response.status}`) + detail;
      lastError = friendlyError(response.status, message, options.task);
      if (attempt < attempts && transient(response.status, message)) continue;
      throw lastError;
    }

    const raw = responseText(payload);
    if (!raw) {
      const reason =
        payload.promptFeedback?.blockReason ??
        payload.candidates?.[0]?.finishReason ??
        "empty response";
      lastError = new Error(`[Gemini Error] ${reason}`);
      if (attempt < attempts) continue;
      throw lastError;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
    } catch {
      lastError = new Error(
        `[Gemini JSON Error] Invalid structured response ` +
          `(finish=${payload.candidates?.[0]?.finishReason ?? "unknown"}, ` +
          `outputTokens=${payload.usageMetadata?.candidatesTokenCount ?? "unknown"}, ` +
          `characters=${raw.length}): ${raw.slice(0, 300)}`,
      );
      if (attempt < attempts) continue;
      throw lastError;
    }

    if (options.repair) parsed = options.repair(parsed);
    const validated = options.schema.safeParse(parsed);
    if (validated.success) return validated.data;

    const issues = validated.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    lastError = new Error(`[Gemini Schema Error] ${issues}`);
    if (attempt === attempts) throw lastError;
  }

  throw lastError ?? new Error("Gemini structured generation failed.");
}
