import OpenAI from "openai";
import { modelFor, type AiTask } from "./models";

// ============================================
// Provider — local open-source models through Ollama
//
// Ollama serves an OpenAI-compatible /v1/chat/completions, so the transport is
// unchanged from the hosted gateway this replaced: the same OpenAI client, the
// same request shapes, the same streaming and tool-calling code. What changed
// is the base URL and which model each task names.
//
// No API key is involved. Ollama does not authenticate by default, but the
// OpenAI client requires the field to be set, so a placeholder is sent and
// ignored. OLLAMA_API_KEY exists for deployments that put the server behind a
// proxy which does check.
//
// The previous providers — Claude through the EcoAPI gateway, and Gemini
// before it — are preserved in ./previous-providers.ts, commented rather than
// deleted, with notes on restoring either.
// ============================================

/** Where the Ollama server is. */
const BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434/v1";

/**
 * Output ceiling.
 *
 * Lower than the hosted default of 16000: these models have smaller context
 * windows, and reserving most of it for output starves the prompt. The longest
 * thing generated here is one slide's content, which fits comfortably.
 */
const MAX_OUTPUT_TOKENS = Number(process.env.OLLAMA_MAX_TOKENS ?? 4096);

const MAX_RETRIES = 2;

let client: OpenAI | null = null;

/** The shared client. Built once, since it holds a connection pool. */
export function getClient(): OpenAI {
  if (client) return client;
  client = new OpenAI({
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
    baseURL: BASE_URL,
    // Local generation on CPU is slow; the client's default would give up on a
    // long slide before the model finished writing it.
    timeout: Number(process.env.OLLAMA_TIMEOUT_MS ?? 300_000),
  });
  return client;
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return JSON.stringify(err);
}

/**
 * Classify a provider error and throw a clean, actionable message.
 *
 * The failures worth naming are different from a hosted gateway's: there is no
 * quota and no key, but the server may not be running, and the model this task
 * asks for may not have been pulled.
 */
export function throwFriendlyError(err: unknown, context: string, task: AiTask): never {
  const status = err instanceof OpenAI.APIError ? err.status : undefined;
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

export { MAX_OUTPUT_TOKENS, MAX_RETRIES, BASE_URL };

// Previous providers — Claude via EcoAPI, and Gemini before it — are kept
// commented in ./previous-providers.ts, with notes on restoring either.
