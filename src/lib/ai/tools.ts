import OpenAI from "openai";
import { modelFor, type AiTask } from "./models";
import { getClient, throwFriendlyError, MAX_OUTPUT_TOKENS } from "./provider";

// ============================================
// Tool calling
//
// One model turn with tools available. Deciding what to do with the result —
// run a tool, stop, try again — is the agent runtime's job, not this file's.
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

/** Translate our message list into the provider's chat format. */
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
  task: AiTask;
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
      model: modelFor(params.task),
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
    throwFriendlyError(err, "generateWithTools", params.task);
  }
}
