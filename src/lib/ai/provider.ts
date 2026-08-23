import { ChatOllama } from "@langchain/ollama";
import { modelFor, type AiTask } from "./models";

// ============================================
// Provider — local open-source models, through LangChain
//
// Every model call in the project is a LangChain chat model. The framework
// owns the message types, the streaming protocol and the tool-call schema, so
// the files above this one describe what they want rather than how a
// particular vendor's HTTP API spells it.
//
// The active integration is @langchain/ollama, which speaks Ollama's native
// API. Ollama does not authenticate by default, so no API key is involved;
// OLLAMA_API_KEY exists only for deployments that put the server behind a
// proxy which does check, and is sent as a bearer header when set.
//
// Because the model is chosen per task, models are built per task and cached:
// each one holds a connection, and rebuilding one on every call would leak
// sockets under load.
//
// The project can run either way — on local models with no key, or on a
// hosted provider behind an API key. The second mode is kept in
// ./previous-providers.ts, commented rather than deleted; switching is a swap
// of the block below for that one. The README's "Two ways to run the models"
// section has the steps.
// ============================================

// ────────────────────────────────────────────────────────────────────────────
// MODE A — local open-source models through Ollama. Active.
// To switch to the API-key mode, comment out everything down to "end of mode A"
// and uncomment provider 2 from ./previous-providers.ts in its place.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Where the Ollama server is.
 *
 * A trailing `/v1` is accepted and stripped: earlier versions of this file
 * spoke the OpenAI-compatible endpoint, so deployments have that suffix in
 * their environment and should not have to edit it to upgrade.
 */
export const BASE_URL = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(
  /\/v1\/?$/,
  "",
);

/**
 * Output ceiling.
 *
 * Lower than a hosted provider's default: these models have smaller context
 * windows, and reserving most of it for output starves the prompt. The longest
 * thing generated here is one slide's content, which fits comfortably.
 */
export const MAX_OUTPUT_TOKENS = Number(process.env.OLLAMA_MAX_TOKENS ?? 4096);

export const MAX_RETRIES = 2;

/** How the caller wants the model configured for one kind of call. */
export interface ChatModelOptions {
  temperature?: number;
  maxOutputTokens?: number;
  /** Ollama's response format. "json" constrains output to a JSON object. */
  format?: "json";
}

const cache = new Map<string, ChatOllama>();

/**
 * The chat model for a task.
 *
 * Cached per task-and-settings, since a model holds a connection and the same
 * few combinations recur for the life of the process.
 */
export function getChatModel(task: AiTask, options: ChatModelOptions = {}): ChatOllama {
  const model = modelFor(task);
  const temperature = options.temperature ?? 0.4;
  const numPredict = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const key = `${model}|${temperature}|${numPredict}|${options.format ?? ""}`;

  const cached = cache.get(key);
  if (cached) return cached;

  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  const chat = new ChatOllama({
    model,
    baseUrl: BASE_URL,
    temperature,
    numPredict,
    ...(options.format ? { format: options.format } : {}),
    ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
    // Local generation on CPU is slow, and LangChain's own retry would repeat
    // a long, expensive call; the callers that need another attempt retry with
    // feedback instead, which is worth more than a blind repeat.
    maxRetries: 0,
  });

  cache.set(key, chat);
  return chat;
}

// ────────────────────────────────────────────────────────────────────────────
// End of mode A. The two helpers below belong to neither mode in particular;
// both use them, so leave them in place when switching.
// ────────────────────────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}

/** HTTP status, if the integration attached one to the error. */
function extractStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const candidate = err as { status?: unknown; status_code?: unknown };
  const raw = candidate.status ?? candidate.status_code;
  return typeof raw === "number" ? raw : undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Mode A's error classification. Mode B replaces this function too — the
// failures differ, and a message naming the wrong ones is worse than none.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Classify a provider error and throw a clean, actionable message.
 *
 * The failures worth naming for a local server are different from a hosted
 * gateway's: there is no quota and no key, but the server may not be running,
 * and the model this task asks for may not have been pulled.
 */
export function throwFriendlyError(err: unknown, context: string, task: AiTask): never {
  const status = extractStatus(err);
  const msg = extractErrorMessage(err);
  const model = modelFor(task);

  if (/socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg)) {
    throw new Error(
      `[LLM Network Error] ${context} — could not reach Ollama at ${BASE_URL}. ` +
        `Start it with \`ollama serve\`. (${msg})`,
    );
  }
  if (status === 404 || /not.?found|no such model|unknown model|try pulling/i.test(msg)) {
    throw new Error(
      `[LLM Model Error] ${context} — Ollama does not have "${model}". ` +
        `Pull it with \`ollama pull ${model}\`, or point ${task} at a model you have.`,
    );
  }
  if (status === 401 || status === 403) {
    throw new Error(
      `[LLM Auth Error] ${context} — the Ollama endpoint refused the request. ` +
        `If it sits behind an authenticating proxy, set OLLAMA_API_KEY.`,
    );
  }
  if (/context length|too many tokens|exceeds/i.test(msg)) {
    throw new Error(
      `[LLM Context Error] ${context} — the prompt is longer than "${model}" accepts. ` +
        `Use a model with a larger context window for ${task}. (${msg})`,
    );
  }
  throw new Error(`[LLM Error] ${context} (${task}) — ${msg}`);
}

// The API-key mode — Claude via the EcoAPI gateway — and the Gemini
// implementation before it are kept commented in ./previous-providers.ts.
