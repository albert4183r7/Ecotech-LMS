import { db } from "@/lib/db";
import type { AgentRunResult, AgentStepRecord } from "./runtime";

// ============================================
// Run persistence
// ============================================

export async function startRun(params: {
  kind: "lesson" | "deck";
  objective: string;
  lessonId?: string;
}): Promise<string> {
  const run = await db.agentRun.create({
    data: {
      kind: params.kind,
      objective: params.objective,
      lessonId: params.lessonId ?? null,
      status: "RUNNING",
    },
  });
  return run.id;
}

export async function recordStep(runId: string, step: AgentStepRecord): Promise<void> {
  try {
    await db.agentStep.create({
      data: {
        runId,
        index: step.index,
        text: step.text.slice(0, 4000),
        toolCalls: JSON.stringify(
          step.toolCalls.map((c) => ({
            name: c.name,
            ok: c.ok,
            error: c.error?.slice(0, 500),
            ms: c.ms,
            // Arguments can be large; keep a bounded copy for debugging.
            args: JSON.stringify(c.args).slice(0, 1500),
          })),
        ),
        inTokens: step.usage.input,
        outTokens: step.usage.output,
      },
    });
  } catch (err) {
    // Losing a step record must never fail the run itself.
    console.error(`[agent] could not record step ${step.index} of run ${runId}:`, err);
  }
}

export async function finishRun(runId: string, result: AgentRunResult): Promise<void> {
  await db.agentRun.update({
    where: { id: runId },
    data: {
      status:
        result.stopReason === "finished"
          ? "FINISHED"
          : result.stopReason === "error"
            ? "FAILED"
            : "STOPPED",
      stopReason: result.stopReason,
      finalText: result.finalText.slice(0, 8000),
      totalTokens: result.totalTokens,
      durationMs: result.durationMs,
    },
  });
}

export async function failRun(runId: string, message: string): Promise<void> {
  await db.agentRun
    .update({
      where: { id: runId },
      data: { status: "FAILED", stopReason: "error", finalText: message.slice(0, 8000) },
    })
    .catch(() => undefined);
}

export interface EvaluationFinding {
  severity: "blocking" | "advisory";
  slideId?: string;
  problem: string;
  fix: string;
}

export async function recordEvaluation(params: {
  runId: string;
  scope: "content" | "pedagogy" | "visual";
  score: number;
  passed: boolean;
  findings: EvaluationFinding[];
  slideId?: string;
}): Promise<void> {
  await db.evaluation
    .create({
      data: {
        runId: params.runId,
        scope: params.scope,
        score: params.score,
        passed: params.passed,
        findings: JSON.stringify(params.findings),
        slideId: params.slideId ?? null,
      },
    })
    .catch((err) => console.error("[agent] could not record evaluation:", err));
}
