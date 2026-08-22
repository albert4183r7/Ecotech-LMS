import OpenAI from "openai";
import { modelFor, type AiTask } from "./models";
import { getClient, throwFriendlyError, MAX_OUTPUT_TOKENS } from "./provider";

// ============================================
// Streaming text
//
// For the two callers where the reply is read as it arrives: the lesson
// assistant, where a student is waiting, and slide HTML, which is long enough
// that a non-streaming request can hit a timeout.
// ============================================

export interface StreamOptions {
  task: AiTask;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Stream text from the model, yielding chunks as they arrive. */
export async function* streamText(
  prompt: string,
  options: StreamOptions,
): AsyncGenerator<string, void, undefined> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (options.systemPrompt) messages.push({ role: "system", content: options.systemPrompt });
  messages.push({ role: "user", content: prompt });

  let stream;
  try {
    stream = await getClient().chat.completions.create({
      model: modelFor(options.task),
      max_tokens: options.maxTokens ?? MAX_OUTPUT_TOKENS,
      temperature: options.temperature ?? 0.7,
      stream: true,
      messages,
    });
  } catch (err) {
    throwFriendlyError(err, "streamText", options.task);
  }

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/** Collect a stream into a single string. */
export async function collectStream(
  stream: AsyncGenerator<string, void, undefined>,
): Promise<string> {
  let out = "";
  for await (const chunk of stream) out += chunk;
  return out;
}
