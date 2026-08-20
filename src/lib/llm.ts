import OpenAI from "openai";
import { z } from "zod/v4";

// ============================================
// LLM client — Claude via the EcoAPI gateway
//
// EcoAPI exposes an OpenAI-compatible surface (/v1/chat/completions), so the
// transport is the OpenAI client pointed at their base URL while the model is
// Claude. The Anthropic SDK cannot be used here: it speaks /v1/messages, which
// this gateway does not serve.
//
// Consequence worth knowing: Anthropic-native features — adaptive thinking,
// output_config, prompt-caching controls — are not reachable through an
// OpenAI-shaped relay. Structured output is enforced by asking for JSON and
// validating with Zod, which is portable across gateways.
//
// The previous Gemini implementation is kept verbatim at the bottom of this
// file, commented out, so switching back is a matter of restoring it.
// ============================================

/** Model id. Set CLAUDE_MODEL to whatever string the gateway expects. */
export const LLM_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5";

/** Generous ceiling; long slide content and plans need room. */
const MAX_OUTPUT_TOKENS = Number(process.env.CLAUDE_MAX_TOKENS ?? 16000);

const MAX_RETRIES = 2;

// ────────────────────────────────────────────────
// Client
// ────────────────────────────────────────────────

let client: OpenAI | null = null;

/** Lazily build the client from the gateway's key and base URL. */
export function getClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.ECOAPI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[LLM Config Error] ECOAPI_API_KEY is not set. Add it to .env — see the README.",
    );
  }

  client = new OpenAI({
    apiKey,
    baseURL: process.env.ECOAPI_BASE_URL ?? "https://www.ecoapi.ai/api/v1",
  });
  return client;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}

/** Classify an API error and throw a clean, actionable message. */
function throwFriendlyError(err: unknown, context: string): never {
  const status = err instanceof OpenAI.APIError ? err.status : undefined;
  const msg = extractErrorMessage(err);

  if (status === 429 || /rate.?limit|quota|insufficient|balance/i.test(msg)) {
    throw new Error(
      `[LLM Rate Limited] ${context} — the gateway reported a quota or rate limit. Check the EcoAPI balance, or retry shortly.`,
    );
  }
  if (status === 401 || status === 403 || /api.?key|unauthor|forbidden/i.test(msg)) {
    throw new Error(
      `[LLM Auth Error] ${context} — check that ECOAPI_API_KEY is set and valid for this gateway.`,
    );
  }
  if (status === 404 || /not.?found|no such model|unknown model/i.test(msg)) {
    throw new Error(
      `[LLM Model Error] ${context} — the gateway does not recognise model "${LLM_MODEL}". Set CLAUDE_MODEL to a model id EcoAPI lists.`,
    );
  }
  if (/socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg)) {
    throw new Error(
      `[LLM Network Error] ${context} — could not reach the gateway at ${process.env.ECOAPI_BASE_URL ?? "the configured base URL"}. (${msg})`,
    );
  }
  throw new Error(`[LLM Error] ${context} — ${msg}`);
}

// ────────────────────────────────────────────────
// Structured JSON
// ────────────────────────────────────────────────

/** Strip the dialect key; it is not part of a response-format contract. */
function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/** Remove a fenced code block if the model wrapped its JSON in one. */
function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/**
 * Generate JSON conforming to a Zod schema.
 *
 * The gateway's JSON-schema support is unknown and varies between relays, so
 * the schema is sent in the instructions and enforced here by Zod rather than
 * relied on at the API level. Retries cover transient failures and refinement
 * misses.
 */
export async function generateStructuredJSON<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options?: {
    /** Coerce the parsed JSON before schema validation, to fix a predictable
     *  model mistake instead of spending a retry on it. */
    repair?: (parsed: unknown) => unknown;
    systemInstruction?: string;
    temperature?: number;
  },
): Promise<T> {
  const jsonSchema = toJsonSchema(schema);
  const system = [
    options?.systemInstruction ?? "",
    "Reply with a single JSON object and nothing else — no prose, no code fences.",
    "It must satisfy this JSON Schema exactly. Pay particular attention to every",
    "minLength, maxLength, minimum, maximum and minItems/maxItems constraint: a",
    "value one character over a maxLength is rejected outright.",
    JSON.stringify(jsonSchema),
  ]
    .filter(Boolean)
    .join("\n\n");

  let lastError: Error | null = null;
  // Carries the previous attempt's output and the exact reason it was
  // rejected. Without this a retry re-sent an identical request and failed the
  // same way every time, which is what made a long-subtopic outline
  // unrecoverable rather than merely unlucky.
  let correction: { badOutput: string; issues: string } | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ];
    if (correction) {
      messages.push({ role: "assistant", content: correction.badOutput });
      messages.push({
        role: "user",
        content: [
          "That response was rejected by schema validation:",
          correction.issues,
          "",
          "Send the whole object again, corrected. Change only what the errors",
          "name; keep everything else as you wrote it. Where a value is too long,",
          "shorten it by rewriting it more tightly or by splitting it into",
          "separate entries — do not simply cut it off mid-word.",
        ].join("\n"),
      });
    }

    let rawContent: string;
    try {
      const response = await getClient().chat.completions.create({
        model: LLM_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: options?.temperature ?? 0.4,
        response_format: { type: "json_object" },
        messages,
      });
      rawContent = response.choices[0]?.message?.content ?? "";
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFences(rawContent));
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
      .slice(0, 12)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    correction = { badOutput: JSON.stringify(parsed), issues };
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
  options?: { systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number },
): AsyncGenerator<string, void, undefined> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options?.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
  messages.push({ role: "user", content: prompt });

  let stream;
  try {
    stream = await getClient().chat.completions.create({
      model: options?.model ?? LLM_MODEL,
      max_tokens: options?.maxTokens ?? MAX_OUTPUT_TOKENS,
      temperature: options?.temperature ?? 0.7,
      stream: true,
      messages,
    });
  } catch (err) {
    throwFriendlyError(err, "streamText");
  }

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

// ────────────────────────────────────────────────
// Tool calling
// ────────────────────────────────────────────────

/** A tool invocation the model asked for. */
export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** One turn of the model: prose, tool calls, or both. */
export interface ModelTurn {
  text: string;
  toolCalls: ToolCallRequest[];
  usage: { input: number; output: number; total: number };
}

/** A conversation entry. `tool` carries results back to the model. */
export type AgentMessage =
  | { role: "user"; text: string }
  | { role: "model"; text: string; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; name: string; result: unknown };

/** An image supplied to the model, for visual evaluation. */
export interface ImageInput {
  mimeType: string;
  /** Base64-encoded bytes. */
  data: string;
}

/** A tool exposed to the model. `parameters` is a JSON Schema object. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Translate our message list into the gateway's chat format. */
function toChatMessages(messages: AgentMessage[]): OpenAI.ChatCompletionMessageParam[] {
  const out: OpenAI.ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      out.push({ role: "user", content: message.text });
      continue;
    }

    if (message.role === "model") {
      out.push({
        role: "assistant",
        content: message.text || null,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              })),
            }
          : {}),
      });
      continue;
    }

    // A tool result must reference the call it answers. The runtime appends
    // results in the order the calls were made, so pair them by walking back
    // to the most recent assistant turn that is still missing a result.
    const pendingId = findPendingToolCallId(out, message.name);
    out.push({
      role: "tool",
      tool_call_id: pendingId,
      content: typeof message.result === "string" ? message.result : JSON.stringify(message.result),
    });
  }

  return out;
}

/** Find the id of the most recent unanswered call to `name`. */
function findPendingToolCallId(built: OpenAI.ChatCompletionMessageParam[], name: string): string {
  const answered = new Set(
    built.filter((m) => m.role === "tool").map((m) => (m as { tool_call_id: string }).tool_call_id),
  );

  for (let i = built.length - 1; i >= 0; i--) {
    const message = built[i];
    if (message.role !== "assistant") continue;
    const calls = (message as { tool_calls?: { id: string; function: { name: string } }[] })
      .tool_calls;
    if (!calls) continue;
    const match = calls.find((c) => c.function.name === name && !answered.has(c.id));
    if (match) return match.id;
  }
  return name;
}

/**
 * One model turn with tools available.
 *
 * Returns whatever the model produced — prose, tool calls, or both. Deciding
 * what to do next is the runtime's job, not this function's.
 */
export async function generateWithTools(params: {
  messages: AgentMessage[];
  tools: ToolDeclaration[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<ModelTurn> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (params.systemInstruction) {
    messages.push({ role: "system", content: params.systemInstruction });
  }
  messages.push(...toChatMessages(params.messages));

  try {
    const response = await getClient().chat.completions.create({
      model: LLM_MODEL,
      max_tokens: params.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
      temperature: params.temperature ?? 0.3,
      messages,
      ...(params.tools.length
        ? {
            tools: params.tools.map((tool) => ({
              type: "function" as const,
              function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
              },
            })),
          }
        : {}),
    });

    const choice = response.choices[0]?.message;
    const toolCalls: ToolCallRequest[] = (choice?.tool_calls ?? [])
      .filter((call) => call.type === "function")
      .map((call) => {
        const fn = (call as { id: string; function: { name: string; arguments: string } }).function;
        let args: Record<string, unknown> = {};
        try {
          args = fn.arguments ? (JSON.parse(fn.arguments) as Record<string, unknown>) : {};
        } catch {
          // Malformed arguments become a validation failure downstream, which
          // the agent can react to, rather than throwing here.
        }
        return { id: (call as { id: string }).id, name: fn.name, args };
      });

    return {
      text: choice?.content ?? "",
      toolCalls,
      usage: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
    };
  } catch (err) {
    throwFriendlyError(err, "generateWithTools");
  }
}

/**
 * Structured JSON with images in the prompt.
 *
 * Used by the visual evaluator, which has to look at a rendered slide rather
 * than reason about its markup.
 */
export async function generateStructuredFromImages<T>(
  prompt: string,
  images: ImageInput[],
  schema: z.ZodType<T>,
  options?: { systemInstruction?: string; temperature?: number },
): Promise<T> {
  const jsonSchema = toJsonSchema(schema);
  const system = [
    options?.systemInstruction ?? "",
    "Reply with a single JSON object and nothing else — no prose, no code fences.",
    "It must satisfy this JSON Schema exactly:",
    JSON.stringify(jsonSchema),
  ]
    .filter(Boolean)
    .join("\n\n");

  let raw: string;
  try {
    const response = await getClient().chat.completions.create({
      model: LLM_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: options?.temperature ?? 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...images.map((img) => ({
              type: "image_url" as const,
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            })),
          ],
        },
      ],
    });
    raw = response.choices[0]?.message?.content ?? "";
  } catch (err) {
    throwFriendlyError(err, "generateStructuredFromImages");
  }

  const parsed = schema.safeParse(JSON.parse(stripFences(raw)));
  if (!parsed.success) {
    throw new Error(
      `[LLM Schema Error] generateStructuredFromImages — ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data as T;
}

// ============================================================================
// PREVIOUS PROVIDER — Google Gemini via @google/genai
//
// Kept for reference so the switch back is a restore, not a rewrite. To use it:
// uncomment everything below, delete the OpenAI-compatible implementation
// above, reinstate GEMINI_API_KEY / GEMINI_MODEL in .env, and reinstall
// @google/genai.
// ============================================================================
// import { GoogleGenAI } from "@google/genai";
// import { z } from "zod/v4";
//
// // ============================================
// // General-purpose LLM client wrapper
// // Google Gemini via @google/genai
// // Server-only — never import on the client.
// // ============================================
//
// /** Model id. Override with GEMINI_MODEL.
//  *  `gemini-flash-latest` is a rolling alias, so it does not go stale.
//  *  Use `gemini-pro-latest` for higher-quality outlines at greater cost. */
// export const LLM_MODEL = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
//
// /** Generous ceiling — on Gemini 2.5+ this budget also covers thinking tokens,
//  *  so a tight limit truncates the answer rather than the reasoning. */
// const MAX_OUTPUT_TOKENS = 16384;
//
// const MAX_RETRIES = 2;
//
// // ────────────────────────────────────────────────
// // Client
// // ────────────────────────────────────────────────
//
// let client: GoogleGenAI | null = null;
//
// /** Lazily build the Gemini client from GEMINI_API_KEY. */
// export function getClient(): GoogleGenAI {
//   if (client) return client;
//
//   const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
//   if (!apiKey) {
//     throw new Error(
//       "[LLM Config Error] GEMINI_API_KEY is not set. Add it to .env — see the README.",
//     );
//   }
//
//   client = new GoogleGenAI({ apiKey });
//   return client;
// }
//
// /** Extract a human-readable message from an unknown error. */
// function extractErrorMessage(err: unknown): string {
//   if (err instanceof Error) return err.message;
//   if (typeof err === "string") return err;
//   return JSON.stringify(err);
// }
//
// /** Classify an API error and throw a clean, actionable message. */
// function throwFriendlyError(err: unknown, context: string): never {
//   const msg = extractErrorMessage(err);
//
//   if (/429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg)) {
//     throw new Error(
//       `[LLM Rate Limited] ${context} — Gemini returned a quota or rate-limit error. Retry after a brief wait.`,
//     );
//   }
//
//   if (/401|403|PERMISSION_DENIED|UNAUTHENTICATED|API.?key/i.test(msg)) {
//     throw new Error(`[LLM Auth Error] ${context} — check that GEMINI_API_KEY is set and valid.`);
//   }
//
//   if (/404|NOT_FOUND/i.test(msg)) {
//     throw new Error(
//       `[LLM Model Error] ${context} — model "${LLM_MODEL}" was not found for this API key. Set GEMINI_MODEL to one your account can access.`,
//     );
//   }
//
//   if (/socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg)) {
//     throw new Error(
//       `[LLM Network Error] ${context} — could not reach the Gemini API. Check connectivity and any proxy or firewall between this host and generativelanguage.googleapis.com. (${msg})`,
//     );
//   }
//
//   throw new Error(`[LLM Error] ${context} — ${msg}`);
// }
//
// // ────────────────────────────────────────────────
// // Structured JSON
// // ────────────────────────────────────────────────
//
// /** Convert a Zod schema to the JSON Schema Gemini accepts.
//  *  The `$schema` dialect key is not part of the response-schema contract. */
// function toGeminiJsonSchema(schema: z.ZodType): Record<string, unknown> {
//   const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
//   delete jsonSchema.$schema;
//   return jsonSchema;
// }
//
// /**
//  * Generate JSON conforming to a Zod schema.
//  *
//  * Gemini enforces the shape natively via `responseJsonSchema`, so the response
//  * is already constrained; the Zod parse is a second gate that also gives us the
//  * typed value. Retries cover transient API failures and refinement misses.
//  */
// export async function generateStructuredJSON<T>(
//   prompt: string,
//   schema: z.ZodType<T>,
//   options?: {
//     /** Coerce the parsed JSON before schema validation. Lets a caller fix a
//      *  predictable model mistake (swapped fields, a legacy shape) instead of
//      *  spending a retry on it. */
//     repair?: (parsed: unknown) => unknown;
//     /** Extra instruction prepended as the system instruction. */
//     systemInstruction?: string;
//     temperature?: number;
//   },
// ): Promise<T> {
//   const responseJsonSchema = toGeminiJsonSchema(schema);
//   let lastError: Error | null = null;
//
//   for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
//     let rawContent: string;
//
//     try {
//       const response = await getClient().models.generateContent({
//         model: LLM_MODEL,
//         contents: prompt,
//         config: {
//           systemInstruction: options?.systemInstruction,
//           responseMimeType: "application/json",
//           responseJsonSchema,
//           temperature: options?.temperature ?? 0.4,
//           maxOutputTokens: MAX_OUTPUT_TOKENS,
//         },
//       });
//       rawContent = response.text ?? "";
//     } catch (err) {
//       throwFriendlyError(err, "generateStructuredJSON");
//     }
//
//     if (!rawContent.trim()) {
//       lastError = new Error(
//         "[LLM Error] generateStructuredJSON — the model returned an empty response.",
//       );
//       console.error(
//         `[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: empty response, retrying...`,
//       );
//       continue;
//     }
//
//     // Defensive: strip fences in case a model ignores the JSON mime type.
//     const cleaned = rawContent
//       .replace(/^```(?:json)?\s*/i, "")
//       .replace(/\s*```\s*$/, "")
//       .trim();
//
//     let parsed: unknown;
//     try {
//       parsed = JSON.parse(cleaned);
//     } catch {
//       lastError = new Error(
//         `[LLM Error] generateStructuredJSON — invalid JSON. Raw response:\n${rawContent.slice(0, 500)}`,
//       );
//       console.error(
//         `[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: invalid JSON, retrying...`,
//       );
//       continue;
//     }
//
//     if (options?.repair) {
//       try {
//         parsed = options.repair(parsed);
//       } catch (repairErr) {
//         console.error("[generateStructuredJSON] repair() threw, using raw response:", repairErr);
//       }
//     }
//
//     const result = schema.safeParse(parsed);
//     if (result.success) return result.data as T;
//
//     const issues = result.error.issues
//       .slice(0, 5)
//       .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
//       .join("\n");
//     lastError = new Error(
//       `[LLM Schema Error] generateStructuredJSON — response does not match the expected schema.\n\nValidation issues:\n${issues}\n\nReceived (first 500 chars):\n${JSON.stringify(parsed, null, 2).slice(0, 500)}`,
//     );
//     console.error(
//       `[generateStructuredJSON] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: schema validation failed, retrying...\n${issues}`,
//     );
//   }
//
//   throw lastError ?? new Error("generateStructuredJSON failed after all retries.");
// }
//
// // ────────────────────────────────────────────────
// // Streaming text
// // ────────────────────────────────────────────────
//
// /** Stream text from the model, yielding chunks as they arrive. */
// export async function* streamText(
//   prompt: string,
//   options?: {
//     systemPrompt?: string;
//     model?: string;
//     temperature?: number;
//   },
// ): AsyncGenerator<string, void, undefined> {
//   let stream: AsyncGenerator<{ text?: string }, unknown, unknown>;
//
//   try {
//     stream = (await getClient().models.generateContentStream({
//       model: options?.model ?? LLM_MODEL,
//       contents: prompt,
//       config: {
//         systemInstruction: options?.systemPrompt,
//         temperature: options?.temperature ?? 0.7,
//         maxOutputTokens: MAX_OUTPUT_TOKENS,
//       },
//     })) as AsyncGenerator<{ text?: string }, unknown, unknown>;
//   } catch (err) {
//     throwFriendlyError(err, "streamText");
//   }
//
//   for await (const chunk of stream) {
//     if (chunk.text) yield chunk.text;
//   }
// }
//
// // ────────────────────────────────────────────────
// // Tool calling
// // ────────────────────────────────────────────────
//
// /** A tool invocation the model asked for. */
// export interface ToolCallRequest {
//   id: string;
//   name: string;
//   args: Record<string, unknown>;
// }
//
// /** One turn of the model: prose, tool calls, or both. */
// export interface ModelTurn {
//   text: string;
//   toolCalls: ToolCallRequest[];
//   usage: { input: number; output: number; total: number };
// }
//
// /** A conversation entry. `tool` carries results back to the model. */
// export type AgentMessage =
//   | { role: "user"; text: string }
//   | { role: "model"; text: string; toolCalls?: ToolCallRequest[] }
//   | { role: "tool"; name: string; result: unknown };
//
// /** An image supplied to the model, for visual evaluation. */
// export interface ImageInput {
//   mimeType: string;
//   /** Base64-encoded bytes. */
//   data: string;
// }
//
// interface GeminiPart {
//   text?: string;
//   inlineData?: { mimeType: string; data: string };
//   functionCall?: { name?: string; args?: Record<string, unknown> };
//   functionResponse?: { name: string; response: Record<string, unknown> };
// }
//
// /** Translate our message list into the SDK's content format. */
// function toContents(messages: AgentMessage[]): { role: string; parts: GeminiPart[] }[] {
//   return messages.map((m) => {
//     if (m.role === "tool") {
//       return {
//         role: "user",
//         parts: [
//           {
//             functionResponse: {
//               name: m.name,
//               // The SDK requires an object; wrap primitives and arrays.
//               response:
//                 m.result !== null && typeof m.result === "object" && !Array.isArray(m.result)
//                   ? (m.result as Record<string, unknown>)
//                   : { result: m.result },
//             },
//           },
//         ],
//       };
//     }
//     if (m.role === "model") {
//       const parts: GeminiPart[] = [];
//       if (m.text) parts.push({ text: m.text });
//       for (const call of m.toolCalls ?? []) {
//         parts.push({ functionCall: { name: call.name, args: call.args } });
//       }
//       // A model turn must not be empty.
//       if (parts.length === 0) parts.push({ text: " " });
//       return { role: "model", parts };
//     }
//     return { role: "user", parts: [{ text: m.text }] };
//   });
// }
//
// /** A tool exposed to the model. `parameters` is a JSON Schema object. */
// export interface ToolDeclaration {
//   name: string;
//   description: string;
//   parameters: Record<string, unknown>;
// }
//
// /**
//  * One model turn with tools available.
//  *
//  * Returns whatever the model produced — prose, tool calls, or both. Deciding
//  * what to do next is the runtime's job, not this function's.
//  */
// export async function generateWithTools(params: {
//   messages: AgentMessage[];
//   tools: ToolDeclaration[];
//   systemInstruction?: string;
//   temperature?: number;
//   maxOutputTokens?: number;
// }): Promise<ModelTurn> {
//   const { messages, tools, systemInstruction, temperature = 0.3 } = params;
//
//   try {
//     const response = await getClient().models.generateContent({
//       model: LLM_MODEL,
//       contents: toContents(messages) as never,
//       config: {
//         systemInstruction,
//         temperature,
//         maxOutputTokens: params.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
//         tools: tools.length
//           ? [
//               {
//                 functionDeclarations: tools.map((t) => ({
//                   name: t.name,
//                   description: t.description,
//                   parametersJsonSchema: t.parameters,
//                 })),
//               },
//             ]
//           : undefined,
//       },
//     });
//
//     const calls = (response.functionCalls ?? []).map((c, i) => ({
//       id: `${c.name ?? "tool"}_${i}`,
//       name: c.name ?? "",
//       args: (c.args ?? {}) as Record<string, unknown>,
//     }));
//
//     const meta = response.usageMetadata;
//     return {
//       text: response.text ?? "",
//       toolCalls: calls.filter((c) => c.name),
//       usage: {
//         input: meta?.promptTokenCount ?? 0,
//         output: meta?.candidatesTokenCount ?? 0,
//         total: meta?.totalTokenCount ?? 0,
//       },
//     };
//   } catch (err) {
//     throwFriendlyError(err, "generateWithTools");
//   }
// }
//
// /**
//  * Structured JSON with optional images in the prompt.
//  *
//  * Used by the visual evaluator, which has to look at a rendered slide rather
//  * than reason about its markup.
//  */
// export async function generateStructuredFromImages<T>(
//   prompt: string,
//   images: ImageInput[],
//   schema: z.ZodType<T>,
//   options?: { systemInstruction?: string; temperature?: number },
// ): Promise<T> {
//   const responseJsonSchema = toGeminiJsonSchema(schema);
//   const parts: GeminiPart[] = [
//     { text: prompt },
//     ...images.map((img) => ({ inlineData: { mimeType: img.mimeType, data: img.data } })),
//   ];
//
//   let raw: string;
//   try {
//     const response = await getClient().models.generateContent({
//       model: LLM_MODEL,
//       contents: [{ role: "user", parts }] as never,
//       config: {
//         systemInstruction: options?.systemInstruction,
//         responseMimeType: "application/json",
//         responseJsonSchema,
//         temperature: options?.temperature ?? 0.2,
//         maxOutputTokens: MAX_OUTPUT_TOKENS,
//       },
//     });
//     raw = response.text ?? "";
//   } catch (err) {
//     throwFriendlyError(err, "generateStructuredFromImages");
//   }
//
//   const cleaned = raw
//     .replace(/^```(?:json)?\s*/i, "")
//     .replace(/\s*```\s*$/, "")
//     .trim();
//
//   const parsed = schema.safeParse(JSON.parse(cleaned));
//   if (!parsed.success) {
//     throw new Error(
//       `[LLM Schema Error] generateStructuredFromImages — ${parsed.error.issues
//         .slice(0, 3)
//         .map((i) => `${i.path.join(".")}: ${i.message}`)
//         .join("; ")}`,
//     );
//   }
//   return parsed.data as T;
// }
//
