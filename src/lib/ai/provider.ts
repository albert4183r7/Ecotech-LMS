import { ChatOpenAI } from "@langchain/openai";
import { modelFor, type AiTask } from "./models";

// ============================================
// Provider — hosted models behind an API key, through LangChain
//
// Every model call in the project is a LangChain chat model. The framework
// owns the message types, the streaming protocol and the tool-call schema, so
// the files above this one describe what they want rather than how a
// particular vendor's HTTP API spells it.
//
// This is the API-key branch: the models come from a gateway that
// authenticates with a key, reached with LangChain's ChatOpenAI. The same file
// on claude/llm-open-source builds a ChatOllama against a local server
// instead. Both export the same two functions, which is why the mode is a
// branch rather than a setting — nothing above this file changes.
//
// The gateway is EcoAPI by default, but nothing here is specific to it: any
// endpoint that speaks the OpenAI surface works by changing ECOAPI_BASE_URL
// and the model ids in ./models.ts.
//
// Because the model is chosen per task, models are built per task and cached:
// each one holds a connection, and rebuilding one on every call would leak
// sockets under load.
// ============================================

/** The gateway's OpenAI-compatible endpoint. */
export const BASE_URL = process.env.ECOAPI_BASE_URL ?? "https://www.ecoapi.ai/api/v1";

/**
 * Output ceiling.
 *
 * Generous, unlike the local branch's: a hosted model has the context window
 * for it, and the longest thing generated here — one slide's content, or a
 * whole outline — is better finished than truncated.
 */
export const MAX_OUTPUT_TOKENS = Number(process.env.CLAUDE_MAX_TOKENS ?? 16000);

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

export const MAX_RETRIES = 2;

/**
 * Attempts for a failure that is the gateway's rather than the request's.
 *
 * A 504 is not a bad prompt — it is the deployment saying it did not finish in
 * time. Re-sending the same request is exactly the right response, which is
 * why these attempts are counted separately from the schema retries: a
 * transient failure must not consume the budget for a genuinely bad answer.
 */
export const TRANSIENT_RETRIES = 2;

/** How long to wait for the gateway before giving up on one attempt. */
export const REQUEST_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 180_000);

/**
 * Whether a failure is worth re-sending unchanged.
 *
 * Gateway timeouts and upstream hiccups (502, 503, 504) and dropped sockets
 * say nothing about the request; a 400 or a 401 says everything about it and
 * will fail identically forever.
 */
export function isTransientError(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 408 || status === 409 || status === 429) return true;
  if (status !== undefined && status >= 500) return true;
  const msg = extractErrorMessage(err);
  return /timeout|timed out|ETIMEDOUT|ECONNRESET|EPIPE|socket hang up|fetch failed|network|deployment|upstream|bad gateway|gateway|service unavailable|overloaded/i.test(
    msg,
  );
}

/** How the caller wants the model configured for one kind of call. */
export interface ChatModelOptions {
  temperature?: number;
  maxOutputTokens?: number;
  /** "json" asks the gateway to constrain the reply to a JSON object. */
  format?: "json";
}

const cache = new Map<string, ChatOpenAI>();

/**
 * The chat model for a task.
 *
 * Cached per task-and-settings, since a model holds a connection and the same
 * few combinations recur for the life of the process.
 */
export function getChatModel(task: AiTask, options: ChatModelOptions = {}): ChatOpenAI {
  const apiKey = process.env.ECOAPI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[LLM Config Error] ECOAPI_API_KEY is not set. Add it to .env — see the README. " +
        "To run without a key, on local models, use the claude/llm-open-source branch.",
    );
  }

  const model = modelFor(task);
  const temperature = options.temperature ?? 0.4;
  const maxTokens = options.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const key = `${model}|${temperature}|${maxTokens}|${options.format ?? ""}`;

  const cached = cache.get(key);
  if (cached) return cached;

  const chat = new ChatOpenAI({
    model,
    apiKey,
    configuration: { baseURL: BASE_URL },
    temperature,
    maxTokens,
    // LangChain's own retry would repeat a whole billed call on a transient
    // failure; the callers that need another attempt retry with feedback
    // instead, which is worth more than a blind repeat and costs the same.
    // Transport failures are retried by the callers too — see
    // isTransientError — so that a 504 is distinguishable from a bad answer.
    maxRetries: 0,
    // Without this a stalled gateway holds the request open until something
    // else gives up first, and the caller cannot tell a slow answer from a
    // dead connection.
    timeout: REQUEST_TIMEOUT_MS,
    // JSON mode. A gateway that does not implement response_format will
    // reject the request — drop this line if yours does. The instructions
    // already demand a bare JSON object, and generateStructuredJSON validates
    // and retries with the schema errors, so nothing depends on it.
    ...(options.format === "json"
      ? { modelKwargs: { response_format: { type: "json_object" } } }
      : {}),
  });

  cache.set(key, chat);
  return chat;
}

/**
 * Classify a provider error and throw a clean, actionable message.
 *
 * The failures worth naming for a hosted gateway are the ones a key and a bill
 * bring with them: an exhausted quota, a key that is wrong or expired, a model
 * id the gateway does not sell.
 */
export function throwFriendlyError(err: unknown, context: string, task: AiTask): never {
  const status = extractStatus(err);
  const msg = extractErrorMessage(err);
  const model = modelFor(task);

  if (status === 429 || /rate.?limit|quota|insufficient|balance/i.test(msg)) {
    throw new Error(
      `[LLM Rate Limited] ${context} — the gateway reported a quota or rate limit. ` +
        `Check the account balance, or retry shortly. (${msg})`,
    );
  }
  if (status === 401 || status === 403 || /api.?key|unauthor|forbidden/i.test(msg)) {
    throw new Error(
      `[LLM Auth Error] ${context} — check that ECOAPI_API_KEY is set and valid for ${BASE_URL}.`,
    );
  }
  if (status === 404 || /not.?found|no such model|unknown model/i.test(msg)) {
    throw new Error(
      `[LLM Model Error] ${context} — the gateway does not recognise "${model}". ` +
        `Set the ${task} entry in src/lib/ai/models.ts, or its MODEL_* variable, to a model id it lists.`,
    );
  }
  if (/socket|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network/i.test(msg)) {
    throw new Error(
      `[LLM Network Error] ${context} — could not reach the gateway at ${BASE_URL}. (${msg})`,
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

// The local, open-source mode is a branch: claude/llm-open-source. The Gemini
// implementation this project ran on before LangChain is kept commented in
// ./previous-providers.ts.
