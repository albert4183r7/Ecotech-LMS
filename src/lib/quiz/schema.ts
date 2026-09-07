import { z } from "zod/v4";

// ============================================
// Quiz content model
//
// The shape the generator must produce and the validator judges. Structured
// throughout: nothing is parsed out of prose, so a malformed answer fails
// validation instead of becoming a question with no correct option.
// ============================================

/** Options per question. Four is the convention across the whole quiz. */
export const OPTIONS_PER_QUESTION = 4;

/** The range an instructor may ask for. */
export const MIN_QUIZ_QUESTIONS = 2;
export const MAX_QUIZ_QUESTIONS = 15;

/** How directly a learner can retrieve an answer from the lesson. */
export const QuizDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type QuizDifficulty = z.infer<typeof QuizDifficultySchema>;
export const DEFAULT_QUIZ_DIFFICULTY: QuizDifficulty = "medium";

export function normaliseQuizDifficulty(value: unknown): QuizDifficulty {
  const parsed = QuizDifficultySchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_QUIZ_DIFFICULTY;
}

export const DraftOptionSchema = z.object({
  text: z.string().min(1).max(200).describe("One answer choice"),
  isCorrect: z.boolean().describe("Exactly one option per question is true"),
});

export const DraftQuestionSchema = z.object({
  prompt: z.string().min(10).max(400).describe("The question, answerable from the lesson alone"),
  options: z
    .array(DraftOptionSchema)
    .length(OPTIONS_PER_QUESTION)
    .describe(`Exactly ${OPTIONS_PER_QUESTION} choices, exactly one of them correct`),
  explanation: z
    .string()
    .max(400)
    .optional()
    .describe("Why the correct answer is correct, shown after submission"),
  sourceQuote: z
    .string()
    .min(10)
    .max(300)
    .describe("The sentence from the lesson that supports the correct answer, quoted"),
});

export const DraftQuizSchema = z.object({
  title: z.string().min(3).max(120).describe("A title naming what the quiz covers"),
  /**
   * Bounded by what an instructor may ask for, not by a fixed range.
   *
   * The floor is one rather than the quiz minimum because this schema also
   * validates a revision, which replaces only the questions that were
   * rejected — sometimes a single one. How many a finished quiz needs is
   * enforced where the quiz is saved.
   */
  questions: z.array(DraftQuestionSchema).min(1).max(MAX_QUIZ_QUESTIONS),
});

export type DraftOption = z.infer<typeof DraftOptionSchema>;
export type DraftQuestion = z.infer<typeof DraftQuestionSchema>;
export type DraftQuiz = z.infer<typeof DraftQuizSchema>;

/**
 * How many questions a lesson gets.
 *
 * The instructor's number when they gave one — they know what the lesson is
 * for — and otherwise scaled to how much the lesson actually teaches.
 */
export function questionCountFor(slideCount: number, requested?: number | null): number {
  if (requested && Number.isFinite(requested)) {
    return Math.max(MIN_QUIZ_QUESTIONS, Math.min(MAX_QUIZ_QUESTIONS, Math.round(requested)));
  }
  return Math.max(3, Math.min(8, Math.round(slideCount * 0.6)));
}

/**
 * Fix the mistakes a model reliably makes about correctness flags.
 *
 * Run before validation so a recoverable slip costs nothing. Zero or several
 * correct options is the common one; either is unusable as an MCQ, but the
 * intended answer is almost always the first flagged, or the first option when
 * none is.
 */
export function repairQuiz(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const quiz = parsed as Record<string, unknown>;
  if (!Array.isArray(quiz.questions)) return quiz;

  quiz.questions = quiz.questions.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const question = raw as Record<string, unknown>;
    if (!Array.isArray(question.options)) return question;

    const options = question.options.filter(
      (o): o is Record<string, unknown> => Boolean(o) && typeof o === "object",
    );
    const correct = options.filter((o) => o.isCorrect === true);

    if (correct.length !== 1 && options.length > 0) {
      const intended = correct[0] ?? options[0];
      for (const option of options) option.isCorrect = option === intended;
    }
    question.options = options;
    return question;
  });

  return quiz;
}
