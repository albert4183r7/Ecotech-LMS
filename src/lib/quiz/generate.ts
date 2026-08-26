import { generateStructuredJSON } from "@/lib/ai";
import {
  DraftQuizSchema,
  OPTIONS_PER_QUESTION,
  questionCountFor,
  repairQuiz,
  type DraftQuestion,
  type DraftQuiz,
} from "./schema";
import { validateQuestions, type QuestionVerdict } from "./validator";
import type { LessonSource } from "./lesson-source";

// ============================================
// Quiz generation
//
// Generate, validate every question against the lesson, regenerate only the
// ones that failed, validate again. The revision loop is the point: a
// single-shot call would produce questions nobody had checked against the
// lesson they claim to test.
//
// This is not modelled as a free tool-calling agent because the work has no
// decisions to make about what to do next — the value is in the check-and-fix
// cycle, which is expressed directly.
// ============================================

/**
 * Rounds of asking again.
 *
 * Each round both replaces what the lesson would not support and makes up any
 * shortfall, so the budget is spent on reaching the number the instructor
 * asked for rather than on one fixed pass of repairs.
 */
const MAX_REVISION_PASSES = 3;

const SYSTEM = `You write multiple-choice questions from a single lesson.

THE LESSON IS THE ONLY SOURCE. Everything you ask about must be stated in the
lesson text you are given. You may not use anything you know about the subject
from elsewhere, however certain you are of it — a learner who read this lesson
and nothing else must be able to answer every question.

Each question needs:
- prompt: what is being asked, answerable from the lesson alone.
- options: exactly ${OPTIONS_PER_QUESTION} choices, exactly one correct.
- sourceQuote: the sentence from the lesson that supports the correct answer,
  quoted from it. If you cannot quote the lesson, you cannot ask the question.
- explanation: why the correct answer is correct, in one or two sentences.

Rules for the wrong options:
- Plausible to someone who half-read the lesson, and clearly wrong to someone
  who read it properly.
- Never a second defensible answer. Ambiguity makes the question unusable.
- Never a joke, and never obviously absent-minded filler like "none of these".

Cover different parts of the lesson rather than asking the same thing several
ways, and vary what you ask for: a definition, a consequence, an ordering, a
distinction the lesson draws.`;

function buildPrompt(source: LessonSource, count: number): string {
  return `LESSON: ${source.lessonTitle}

<lesson>
${source.text}
</lesson>

Write ${count} multiple-choice questions covering this lesson.
Give the quiz a title naming what it covers.`;
}

function buildRevisionPrompt(
  source: LessonSource,
  rejected: { question: DraftQuestion; reason: string }[],
  keep: DraftQuestion[],
  wanted: number,
): string {
  const problems = rejected.length
    ? `${rejected.length} question(s) were rejected for not being grounded in this lesson:\n\n` +
      rejected
        .map(
          ({ question, reason }, i) => `[${i + 1}] "${question.prompt}"\n     REJECTED: ${reason}`,
        )
        .join("\n\n") +
      "\n"
    : "";

  const kept = keep.length
    ? `\nThese questions were accepted. Do not repeat what they ask:\n${keep
        .map((q) => `- ${q.prompt}`)
        .join("\n")}\n`
    : "";

  return `LESSON: ${source.lessonTitle}

<lesson>
${source.text}
</lesson>

${problems}${kept}
Write ${wanted} more question(s) on this lesson${
    rejected.length ? ", not repeating the mistakes above" : ""
  }. Every one must quote the lesson in sourceQuote, and must ask about
something the accepted questions do not already cover.`;
}

export interface QuizGenerationReport {
  quiz: DraftQuiz;
  /** How many validation passes ran. */
  passes: number;
  /** Questions dropped because they could not be grounded after every pass. */
  dropped: { prompt: string; reason: string }[];
  /** How many were asked for, so a shortfall can be reported as a shortfall. */
  requested: number;
}

/**
 * Generate a quiz for one lesson, keeping only questions the lesson supports.
 *
 * A question that cannot be grounded after the revision passes is dropped
 * rather than shipped: a quiz of four sound questions is worth more than one of
 * six where two ask about things the lesson never said.
 */
export async function generateQuiz(
  source: LessonSource,
  options: { questionCount?: number | null } = {},
): Promise<QuizGenerationReport> {
  const target = questionCountFor(source.slideCount, options.questionCount);
  /** What the previous round could not ground, so the next one is told why. */
  let lastFailed: { question: DraftQuestion; reason: string }[] = [];

  const draft = await generateStructuredJSON(buildPrompt(source, target), DraftQuizSchema, {
    task: "quiz-authoring",
    repair: repairQuiz,
    systemInstruction: SYSTEM,
    temperature: 0.5,
  });

  const accepted: DraftQuestion[] = [];
  /** Prompts already accepted, so a repeat never counts toward the target. */
  const seen = new Set<string>();
  const key = (q: DraftQuestion) => q.prompt.toLowerCase().replace(/\s+/g, " ").trim();
  let pending = draft.questions.slice(0, target);
  let passes = 0;
  const dropped: { prompt: string; reason: string }[] = [];

  // Each round validates what is pending, then asks for however many are still
  // missing — whether they are missing because the lesson would not support
  // them or because the model simply wrote fewer than it was asked for. The
  // loop used to replace only the rejected ones, once, so a strict lesson
  // returned three questions when ten were asked for and said nothing about it.
  while (passes <= MAX_REVISION_PASSES) {
    passes++;

    if (pending.length > 0) {
      const verdicts: QuestionVerdict[] = await validateQuestions(pending, source);
      const failed: { question: DraftQuestion; reason: string }[] = [];
      verdicts.forEach((verdict, index) => {
        const question = pending[index];
        if (!verdict.ok) {
          failed.push({ question, reason: verdict.reason ?? "not grounded in the lesson" });
          return;
        }
        // Deduplicated as they are accepted, not at the end: a round that
        // repeats a question it already wrote would otherwise count toward the
        // target and then be removed, leaving a quiz shorter than asked for
        // with nothing to say why.
        const id = key(question);
        if (seen.has(id)) {
          failed.push({ question, reason: "repeats a question already accepted" });
          return;
        }
        seen.add(id);
        accepted.push(question);
      });

      console.log(
        `[quiz] pass ${passes}: ${verdicts.filter((v) => v.ok).length} accepted, ` +
          `${failed.length} rejected, ${accepted.length}/${target} so far`,
      );

      // The last round has no round after it to check a replacement, so what
      // failed in it is dropped rather than re-asked.
      if (passes > MAX_REVISION_PASSES) {
        for (const { question, reason } of failed) {
          dropped.push({ prompt: question.prompt, reason });
        }
        break;
      }
      lastFailed = failed;
    }

    const missing = target - accepted.length;
    if (missing <= 0) break;
    if (passes > MAX_REVISION_PASSES) break;

    try {
      const revision = await generateStructuredJSON(
        buildRevisionPrompt(source, lastFailed, accepted, missing),
        DraftQuizSchema,
        {
          task: "quiz-authoring",
          repair: repairQuiz,
          systemInstruction: SYSTEM,
          temperature: 0.6,
        },
      );
      pending = revision.questions.slice(0, missing);
      if (pending.length === 0) break;
    } catch (error) {
      // A failed revision is not a failed quiz; keep what was already sound.
      console.warn("[quiz] revision pass failed:", error instanceof Error ? error.message : error);
      for (const { question, reason } of lastFailed) {
        dropped.push({ prompt: question.prompt, reason });
      }
      break;
    }
    lastFailed = [];
  }

  // Never more than was asked for: a generous revision round can overshoot.
  const questions = accepted.slice(0, target);
  if (questions.length < target) {
    console.warn(
      `[quiz] ${questions.length}/${target} question(s) could be grounded in this lesson`,
    );
  }

  return {
    quiz: { title: draft.title, questions },
    passes,
    dropped,
    requested: target,
  };
}
