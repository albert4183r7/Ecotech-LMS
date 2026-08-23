import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import { type AiTask } from "./models";
import { getChatModel, throwFriendlyError } from "./provider";

// ============================================
// Streaming text
//
// For the two callers where the reply is read as it arrives: the lesson
// assistant, where a student is waiting, and slide HTML, which is long enough
// that a non-streaming request can hit a timeout.
//
// LangChain's .stream() yields message chunks; this narrows them to the text
// a caller actually writes to the response body.
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
  const messages: BaseMessage[] = [];
  if (options.systemPrompt) messages.push(new SystemMessage(options.systemPrompt));
  messages.push(new HumanMessage(prompt));

  const model = getChatModel(options.task, {
    temperature: options.temperature ?? 0.7,
    maxOutputTokens: options.maxTokens,
  });

  let stream;
  try {
    stream = await model.stream(messages);
  } catch (err) {
    throwFriendlyError(err, "streamText", options.task);
  }

  for await (const chunk of stream) {
    const delta = chunk.text;
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
