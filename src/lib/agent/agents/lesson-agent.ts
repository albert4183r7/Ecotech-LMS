import { createRegistry } from "../registry";
import { runAgent, type AgentRunResult } from "../runtime";
import { slideTools } from "../tools/slides";
import { startRun, recordStep, finishRun, failRun } from "../persistence";
import type { AgentStepRecord } from "../runtime";

// ============================================
// Lesson agent
//
// Given a lesson whose slides exist as empty rows, the agent decides how to
// fill them: what to read first, what each slide should say, when to check its
// own output, and what to fix. The loop does not sequence that work.
// ============================================

export const LESSON_AGENT_SYSTEM = `You build presentation-style lessons for a learning platform.

You work by calling tools. Decide what to do next yourself; nothing sequences you.

HOW TO WORK
1. Call get_lesson_context first. You need to know what slides exist and what any finished ones already say.
2. If reference documents were provided, call retrieve_reference before making factual claims.
3. For each slide that still needs content: call generate_slide_html, then save_slide.
4. After saving, call inspect_slide_layout. It measures the real rendered slide.
5. If it reports faults, call revise_slide_html with those faults quoted, save again, and inspect again.
6. Move on when a slide is clean, or after two failed revision attempts on that slide.
7. When every slide is done, reply with a short summary and call no further tools.

SLIDE CONTENT
- Write about the subject. Never describe the lesson itself or what a learner will do.
- Each slide carries one idea. Three to five short points, one line each.
- The first slide is a cover: title and a one-line subtitle only.
- The last slide closes the deck.
- No two slides may repeat a definition or an example. You are told what earlier slides covered; respect it.

FACTUAL RULES
- Statistics, percentages, dates, currency amounts and study findings may only be used if they appear in material returned by retrieve_reference.
- With no source, make the point qualitatively. Never invent a number and never attribute a claim to a named company or study that the source did not name.

WHEN THINGS FAIL
- A tool returning an error is information. Read it, adjust, and continue.
- Do not repeat an identical failing call. Change the arguments or take another route.
- If a slide cannot be made clean, leave it saved with its remaining problems and say so in your summary.`;

export interface LessonAgentOptions {
  lessonId: string;
  /** Uploaded reference documents, as stored on the lesson outline. */
  referenceFileUrls?: string[];
  language?: string;
  audience?: string;
  onStep?: (step: AgentStepRecord) => void | Promise<void>;
  maxSteps?: number;
}

export interface LessonAgentOutcome extends AgentRunResult {
  runId: string;
}

/** Build a lesson with the agent, recording every step. */
export async function runLessonAgent(options: LessonAgentOptions): Promise<LessonAgentOutcome> {
  const objective = [
    `Build the slides for lesson ${options.lessonId}.`,
    options.audience ? `Audience: ${options.audience}.` : "",
    options.language && options.language !== "english"
      ? `Write all slide content in ${options.language}.`
      : "",
    options.referenceFileUrls?.length
      ? `Reference documents are available at these paths, pass them to retrieve_reference: ${JSON.stringify(options.referenceFileUrls)}`
      : "No reference documents were supplied, so use no statistics.",
    "Start by reading the lesson context.",
  ]
    .filter(Boolean)
    .join("\n");

  const runId = await startRun({ kind: "lesson", objective, lessonId: options.lessonId });
  const registry = createRegistry([...slideTools]);

  try {
    const result = await runAgent({
      objective,
      systemInstruction: LESSON_AGENT_SYSTEM,
      registry,
      ctx: {
        runId,
        lessonId: options.lessonId,
        language: options.language ?? "english",
        scratch: {},
      },
      limits: options.maxSteps ? { maxSteps: options.maxSteps } : undefined,
      onStep: async (step) => {
        await recordStep(runId, step);
        await options.onStep?.(step);
      },
    });

    await finishRun(runId, result);
    return { ...result, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failRun(runId, message);
    throw err;
  }
}
