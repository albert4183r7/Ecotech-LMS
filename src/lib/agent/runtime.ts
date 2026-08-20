import {
  generateWithTools,
  type AgentMessage,
  type ModelTurn,
  type ToolDeclaration,
} from "@/lib/llm";
import { runTool, type Registry, type ToolContext } from "./registry";

// ============================================
// Agent runtime
//
// The loop that makes this an agent rather than a pipeline: the model is given
// tools and an objective, and it chooses what to call. The loop only executes
// those choices, feeds results back, and enforces the limits that stop it
// running forever.
// ============================================

export interface AgentLimits {
  /** Model turns. Each turn may contain several tool calls. */
  maxSteps: number;
  /** Total tokens across the run, input and output. */
  maxTokens: number;
  /** Wall-clock budget. */
  maxDurationMs: number;
  /** Consecutive failing tool calls tolerated before the run is abandoned. */
  maxConsecutiveFailures: number;
}

export const DEFAULT_LIMITS: AgentLimits = {
  maxSteps: 24,
  maxTokens: 400_000,
  maxDurationMs: 10 * 60_000,
  maxConsecutiveFailures: 4,
};

export type StopReason =
  "finished" | "max-steps" | "token-budget" | "timeout" | "too-many-failures" | "error";

export interface AgentStepRecord {
  index: number;
  text: string;
  toolCalls: { name: string; args: unknown; ok: boolean; error?: string; ms: number }[];
  usage: { input: number; output: number; total: number };
}

export interface AgentRunResult {
  stopReason: StopReason;
  /** The model's closing message when it finished on its own. */
  finalText: string;
  steps: AgentStepRecord[];
  totalTokens: number;
  durationMs: number;
  messages: AgentMessage[];
}

export interface AgentRunOptions {
  objective: string;
  systemInstruction: string;
  registry: Registry;
  ctx: ToolContext;
  /** Restrict which tools this run may use. Defaults to all registered. */
  allowTools?: string[];
  limits?: Partial<AgentLimits>;
  /** Called after each step, for streaming progress to a client. */
  onStep?: (step: AgentStepRecord) => void | Promise<void>;
  temperature?: number;
  /** Overridable so the loop can be exercised without a live model. */
  generate?: (params: {
    messages: AgentMessage[];
    tools: ToolDeclaration[];
    systemInstruction?: string;
    temperature?: number;
  }) => Promise<ModelTurn>;
}

/**
 * Run the agent until it finishes or a limit trips.
 *
 * A step with no tool calls is treated as the agent's closing statement: it
 * has nothing further it wants to do, so the run ends.
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const { registry, ctx } = options;
  const declarations = registry.declarations(options.allowTools);

  const messages: AgentMessage[] = [{ role: "user", text: options.objective }];
  const steps: AgentStepRecord[] = [];

  const startedAt = Date.now();
  let totalTokens = 0;
  let consecutiveFailures = 0;
  let stopReason: StopReason = "max-steps";
  let finalText = "";

  for (let index = 0; index < limits.maxSteps; index++) {
    if (Date.now() - startedAt > limits.maxDurationMs) {
      stopReason = "timeout";
      break;
    }
    if (totalTokens > limits.maxTokens) {
      stopReason = "token-budget";
      break;
    }

    let turn: ModelTurn;
    const generate = options.generate ?? generateWithTools;
    try {
      turn = await generate({
        messages,
        tools: declarations,
        systemInstruction: options.systemInstruction,
        temperature: options.temperature,
      });
    } catch (err) {
      finalText = err instanceof Error ? err.message : String(err);
      stopReason = "error";
      break;
    }

    totalTokens += turn.usage.total;

    // No tool calls means the agent considers the objective met.
    if (turn.toolCalls.length === 0) {
      finalText = turn.text;
      stopReason = "finished";
      steps.push({ index, text: turn.text, toolCalls: [], usage: turn.usage });
      await options.onStep?.(steps[steps.length - 1]);
      break;
    }

    messages.push({ role: "model", text: turn.text, toolCalls: turn.toolCalls });

    const record: AgentStepRecord = {
      index,
      text: turn.text,
      toolCalls: [],
      usage: turn.usage,
    };

    let anySucceeded = false;

    for (const call of turn.toolCalls) {
      const began = Date.now();
      const outcome = await runTool(registry, call.name, call.args, ctx);
      const ms = Date.now() - began;

      record.toolCalls.push({
        name: call.name,
        args: call.args,
        ok: outcome.ok,
        error: outcome.ok ? undefined : outcome.error,
        ms,
      });

      if (outcome.ok) {
        anySucceeded = true;
        messages.push({ role: "tool", name: call.name, result: outcome.value });
      } else {
        // Hand the failure back so the agent can decide what to do about it.
        messages.push({
          role: "tool",
          name: call.name,
          result: { error: outcome.error, retryable: outcome.retryable },
        });
      }
    }

    consecutiveFailures = anySucceeded ? 0 : consecutiveFailures + 1;
    steps.push(record);
    await options.onStep?.(record);

    if (consecutiveFailures >= limits.maxConsecutiveFailures) {
      stopReason = "too-many-failures";
      break;
    }
  }

  return {
    stopReason,
    finalText,
    steps,
    totalTokens,
    durationMs: Date.now() - startedAt,
    messages,
  };
}
