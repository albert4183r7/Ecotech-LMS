import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { z } from "zod/v4";
import { type AiTask } from "./models";
import {
  getChatModel,
  throwFriendlyError,
  isTransientError,
  MAX_RETRIES,
  TRANSIENT_RETRIES,
} from "./provider";

// ============================================
// Structured JSON
//
// Most of the project's model calls want an object of a known shape. The
// schema is sent in the instructions and enforced here with Zod rather than
// left to the provider, because the guarantees an integration can offer vary
// and this way the contract holds whichever one is active.
//
// LangChain offers withStructuredOutput(), which does the same job in one
// call. It is not used here because it gives back a parse failure and nothing
// to act on, and the retry below is what makes a rejected outline recoverable:
// it hands the model its own output and the exact validation errors.
// ============================================

/** Strip the dialect key; it is not part of a response-format contract. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

/** Remove a fenced code block if the model wrapped its JSON in one. */
export function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/**
 * Parse the first complete JSON object in a response.
 *
 * Some OpenAI-compatible gateways occasionally prepend a short status line or
 * append whitespace/prose even when JSON mode is requested. Retrying the model
 * for bytes we can discard locally adds latency without improving the answer.
 * The schema validation below still decides whether the recovered object is
 * acceptable.
 */
export function parseJsonResponse(raw: string): unknown {
  const clean = stripFences(raw);
  try {
    return JSON.parse(clean);
  } catch {
    let start = -1;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (char === "}" && depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) return JSON.parse(clean.slice(start, i + 1));
      }
    }
    throw new SyntaxError("response did not contain a complete JSON object");
  }
}

export interface StructuredOptions {
  /** Which model runs this. See ./models.ts for the per-task choices. */
  task: AiTask;
  /** Coerce the parsed JSON before schema validation, to fix a predictable
   *  model mistake instead of spending a retry on it. */
  repair?: (parsed: unknown) => unknown;
  systemInstruction?: string;
  temperature?: number;
}

/**
 * Send one request, streaming the reply, and re-send it if the gateway failed.
 *
 * Two things fixed here, both seen as one 504 from the outline planner.
 *
 * It streams. A gateway that buffers a whole response applies a deadline to
 * it, and a plan carrying an audience, a thesis, the vocabulary and a claim
 * per section is long enough to pass that deadline — where the same request
 * streamed keeps producing bytes and is never cut off. This is the same reason
 * generateText streams slide HTML rather than requesting it whole; structured
 * JSON simply never got the same treatment, and only became long enough to
 * need it once the plan started carrying its own brief.
 *
 * And a gateway failure is retried. A 504 is not a bad prompt — it is the
 * deployment saying it did not finish in time — and the request that produced
 * it usually succeeds unchanged. It used to throw straight out of the retry
 * loop below, so one hiccup failed a whole outline and the user saw a 502.
 * Counted separately from the schema retries, so a transport failure cannot
 * consume the budget for a genuinely bad answer.
 */
async function invokeWithTransientRetry(
  model: ReturnType<typeof getChatModel>,
  messages: BaseMessage[],
  task: AiTask,
): Promise<string> {
  let lastTransport: unknown;

  for (let attempt = 0; attempt <= TRANSIENT_RETRIES; attempt++) {
    try {
      const stream = await model.stream(messages);
      let text = "";
      for await (const chunk of stream) text += chunk.text ?? "";
      return text;
    } catch (err) {
      if (!isTransientError(err) || attempt === TRANSIENT_RETRIES) throw err;
      lastTransport = err;
      // Backing off matters when the cause is load rather than chance: an
      // immediate retry arrives while the gateway is still saturated.
      const waitMs = 2000 * 2 ** attempt;
      console.warn(
        `[generateStructuredJSON:${task}] gateway failure on attempt ${attempt + 1}/${
          TRANSIENT_RETRIES + 1
        }, retrying in ${waitMs / 1000}s — ${err instanceof Error ? err.message : String(err)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastTransport;
}

/**
 * Generate JSON conforming to a Zod schema.
 *
 * Retries carry the previous attempt's output and the exact reason it was
 * rejected. Without that a retry re-sent an identical request and failed the
 * same way every time, which is what made a long-subtopic outline
 * unrecoverable rather than merely unlucky.
 */
export async function generateStructuredJSON<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: StructuredOptions,
): Promise<T> {
  const jsonSchema = toJsonSchema(schema);
  const system = [
    options.systemInstruction ?? "",
    "Reply with a single JSON object and nothing else — no prose, no code fences.",
    "It must satisfy this JSON Schema exactly. Pay particular attention to every",
    "minLength, maxLength, minimum, maximum and minItems/maxItems constraint: a",
    "value one character over a maxLength is rejected outright.",
    JSON.stringify(jsonSchema),
  ]
    .filter(Boolean)
    .join("\n\n");

  const model = getChatModel(options.task, {
    temperature: options.temperature ?? 0.4,
    format: "json",
  });

  let lastError: Error | null = null;
  let correction: { badOutput: string; issues: string } | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const messages: BaseMessage[] = [new SystemMessage(system), new HumanMessage(prompt)];
    if (correction) {
      messages.push(new AIMessage(correction.badOutput));
      messages.push(
        new HumanMessage(
          [
            "That response was rejected by schema validation:",
            correction.issues,
            "",
            "Send the whole object again, corrected. Change only what the errors",
            "name; keep everything else as you wrote it. Where a value is too long,",
            "shorten it by rewriting it more tightly or by splitting it into",
            "separate entries — do not simply cut it off mid-word.",
          ].join("\n"),
        ),
      );
    }

    let rawContent: string;
    try {
      rawContent = await invokeWithTransientRetry(model, messages, options.task);
    } catch (err) {
      throwFriendlyError(err, "generateStructuredJSON", options.task);
    }

    if (!rawContent.trim()) {
      lastError = new Error(
        "[LLM Error] generateStructuredJSON — the model returned an empty response.",
      );
      console.error(
        `[generateStructuredJSON:${options.task}] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: empty response, retrying...`,
      );
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parseJsonResponse(rawContent);
    } catch {
      lastError = new Error(
        `[LLM Error] generateStructuredJSON — invalid JSON. Raw response:\n${rawContent.slice(0, 500)}`,
      );
      console.error(
        `[generateStructuredJSON:${options.task}] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: invalid JSON, retrying...`,
      );
      continue;
    }

    if (options.repair) {
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
      `[generateStructuredJSON:${options.task}] Attempt ${attempt + 1}/${MAX_RETRIES + 1}: schema validation failed, retrying...\n${issues}`,
    );
  }

  throw lastError ?? new Error("generateStructuredJSON failed after all retries.");
}
