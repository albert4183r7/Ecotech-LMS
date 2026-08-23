// ============================================
// Previous providers
//
// Every implementation this project has run on, kept commented rather than
// deleted so any of them can be restored. They are listed newest first.
//
// All three present the same surface to the rest of the AI layer — a chat
// model per task, and one error classifier — so restoring one means moving its
// model construction and error classification into ./provider.ts and setting
// ./models.ts to whatever model ids it serves. Nothing above that file changes.
//
// Provider 2 is written as LangChain chat models, like the active one, so the
// switch between local models and an API key is a swap of one file's contents.
// Provider 1 predates LangChain and calls the Gemini SDK directly.
//
// This file is inert: everything below is a comment.
// ============================================

// ============================================================================
// ── PROVIDER 2 — an API-key provider through LangChain (Claude via EcoAPI) ──
//
// Kept for reference and for restoring. This is the hosted-API mode: instead
// of a local Ollama server, the models come from a gateway that authenticates
// with an API key. EcoAPI exposes an OpenAI-compatible surface, so LangChain's
// ChatOpenAI speaks to it with only a base URL change — and because both modes
// are LangChain chat models, everything above ./provider.ts is untouched by
// the switch.
//
// To restore, in ./provider.ts: comment out the ChatOllama implementation,
// uncomment this one, and put the gateway's model ids in ./models.ts. The
// README's "Switching between the two LLM modes" section has the full steps.
//
// import { ChatOpenAI } from "@langchain/openai";
// import { modelFor, type AiTask } from "./models";
//
// /** The gateway's OpenAI-compatible endpoint. */
// export const BASE_URL = process.env.ECOAPI_BASE_URL ?? "https://www.ecoapi.ai/api/v1";
//
// /** Generous ceiling; long slide content and plans need room. */
// export const MAX_OUTPUT_TOKENS = Number(process.env.CLAUDE_MAX_TOKENS ?? 16000);
//
// export const MAX_RETRIES = 2;
//
// export interface ChatModelOptions {
//   temperature?: number;
//   maxOutputTokens?: number;
//   format?: "json";
// }
//
// const cache = new Map<string, ChatOpenAI>();
//
// /** The chat model for a task, built from the gateway's key and base URL. */
// export function getChatModel(task: AiTask, options: ChatModelOptions = {}): ChatOpenAI {
//   const apiKey = process.env.ECOAPI_API_KEY;
//   if (!apiKey) {
//     throw new Error(
//       "[LLM Config Error] ECOAPI_API_KEY is not set. Add it to .env — see the README.",
//     );
//   }
//
//   const model = modelFor(task);
//   const temperature = options.temperature ?? 0.4;
//   const maxTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
//   const key = `${model}|${temperature}|${maxTokens}|${options.format ?? ""}`;
//
//   const cached = cache.get(key);
//   if (cached) return cached;
//
//   const chat = new ChatOpenAI({
//     model,
//     apiKey,
//     configuration: { baseURL: BASE_URL },
//     temperature,
//     maxTokens,
//     maxRetries: 0,
//     // The structured and vision callers ask for JSON; a gateway that speaks
//     // the OpenAI surface takes it as a response_format.
//     ...(options.format === "json"
//       ? { modelKwargs: { response_format: { type: "json_object" } } }
//       : {}),
//   });
//
//   cache.set(key, chat);
//   return chat;
// }
//
// /** Classify an API error and throw a clean, actionable message. */
// export function throwFriendlyError(err: unknown, context: string, task: AiTask): never {
//   const status = extractStatus(err);
//   const msg = extractErrorMessage(err);
//   const model = modelFor(task);
//
//   if (status === 429 || /rate.?limit|quota|insufficient|balance/i.test(msg)) {
//     throw new Error(
//       `[LLM Rate Limited] ${context} — the gateway reported a quota or rate limit. Check the EcoAPI balance, or retry shortly.`,
//     );
//   }
//   if (status === 401 || status === 403 || /api.?key|unauthor|forbidden/i.test(msg)) {
//     throw new Error(
//       `[LLM Auth Error] ${context} — check that ECOAPI_API_KEY is set and valid for this gateway.`,
//     );
//   }
//   if (status === 404 || /not.?found|no such model|unknown model/i.test(msg)) {
//     throw new Error(
//       `[LLM Model Error] ${context} — the gateway does not recognise model "${model}". Set the ${task} entry in ./models.ts to a model id EcoAPI lists.`,
//     );
//   }
//   if (/socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg)) {
//     throw new Error(
//       `[LLM Network Error] ${context} — could not reach the gateway at ${BASE_URL}. (${msg})`,
//     );
//   }
//   throw new Error(`[LLM Error] ${context} (${task}) — ${msg}`);
// }
// ============================================================================

// ============================================================================
// ── PROVIDER 1 — Google Gemini via @google/genai ───────────────────────────
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
