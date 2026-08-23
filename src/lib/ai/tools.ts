import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { type AiTask } from "./models";
import { getChatModel, throwFriendlyError } from "./provider";

// ============================================
// Tool calling
//
// One model turn with tools available. Deciding what to do with the result —
// run a tool, stop, try again — is the agent runtime's job, not this file's.
//
// LangChain's .bindTools() carries the declarations and normalises whatever
// the model returns into a single tool-call shape, so this file translates
// between that shape and the runtime's own, and nothing else.
// ============================================

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

/** Translate our message list into LangChain messages. */
function toLangChainMessages(messages: AgentMessage[]): BaseMessage[] {
  const out: BaseMessage[] = [];

  for (const message of messages) {
    if (message.role === "user") {
      out.push(new HumanMessage(message.text));
      continue;
    }

    if (message.role === "model") {
      out.push(
        new AIMessage({
          content: message.text,
          tool_calls: (message.toolCalls ?? []).map((call) => ({
            id: call.id,
            name: call.name,
            args: call.args,
            type: "tool_call" as const,
          })),
        }),
      );
      continue;
    }

    // A tool result must reference the call it answers. The runtime appends
    // results in the order the calls were made, so pair them by walking back
    // to the most recent model turn that is still missing a result.
    out.push(
      new ToolMessage({
        name: message.name,
        tool_call_id: findPendingToolCallId(out, message.name),
        content:
          typeof message.result === "string" ? message.result : JSON.stringify(message.result),
      }),
    );
  }

  return out;
}

/** Find the id of the most recent unanswered call to `name`. */
function findPendingToolCallId(built: BaseMessage[], name: string): string {
  const answered = new Set(
    built.filter((m): m is ToolMessage => m instanceof ToolMessage).map((m) => m.tool_call_id),
  );

  for (let i = built.length - 1; i >= 0; i--) {
    const message = built[i];
    if (!(message instanceof AIMessage)) continue;
    const match = (message.tool_calls ?? []).find(
      (c) => c.name === name && c.id && !answered.has(c.id),
    );
    if (match?.id) return match.id;
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
  task: AiTask;
  messages: AgentMessage[];
  tools: ToolDeclaration[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<ModelTurn> {
  const messages: BaseMessage[] = [];
  if (params.systemInstruction) {
    messages.push(new SystemMessage(params.systemInstruction));
  }
  messages.push(...toLangChainMessages(params.messages));

  const chat = getChatModel(params.task, {
    temperature: params.temperature ?? 0.3,
    maxOutputTokens: params.maxOutputTokens,
  });
  const model = params.tools.length
    ? chat.bindTools(
        params.tools.map((tool) => ({
          type: "function" as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
      )
    : chat;

  try {
    const response = await model.invoke(messages);
    const usage = response.usage_metadata;

    return {
      text: response.text,
      toolCalls: (response.tool_calls ?? []).map((call, index) => ({
        // Ollama does not always give a call an id; the runtime needs one to
        // pair the result with, so fall back to something stable per turn.
        id: call.id ?? `${call.name}-${index}`,
        name: call.name,
        args: (call.args ?? {}) as Record<string, unknown>,
      })),
      usage: {
        input: usage?.input_tokens ?? 0,
        output: usage?.output_tokens ?? 0,
        total: usage?.total_tokens ?? 0,
      },
    };
  } catch (err) {
    throwFriendlyError(err, "generateWithTools", params.task);
  }
}
