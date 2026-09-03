import { db } from "@/lib/db";
import { generateQuiz } from "./generate";
import { loadLessonSource } from "./lesson-source";

// ============================================
// Quiz persistence
//
// One quiz per lesson, written in a single transaction. Regenerating replaces
// the previous quiz rather than adding to it, so a retry cannot leave a lesson
// with two quizzes or with half of one.
// ============================================

/**
 * A quiz with nothing in it is not a quiz; one with a single question is thin.
 *
 * Thin is kept rather than thrown away. The instructor asked for a quiz, and
 * a short one they can add to by hand is worth more than an error with
 * nothing behind it — which is what a strict lesson used to produce, as a 502
 * and a red panel.
 */
const MIN_QUESTIONS = 1;

export interface QuizResult {
  status: "READY" | "ERROR";
  quizId?: string;
  questionCount?: number;
  dropped?: number;
  /** How many were asked for, so a caller can say when fewer were possible. */
  requested?: number;
  /** Why questions were dropped, so a shortfall can be explained rather than
   *  merely reported. */
  droppedReasons?: string[];
  error?: string;
}

export interface GeneratedQuizForPersistence {
  title: string;
  questions: {
    prompt: string;
    explanation?: string | null;
    sourceQuote?: string | null;
    options: { text: string; isCorrect: boolean }[];
  }[];
}

/**
 * Persist generated questions without replacing the quiz identity.
 * Exported so the grade-preservation invariant can be exercised against a
 * real temporary database without making a model call.
 */
export async function saveGeneratedQuiz(
  lessonId: string,
  generated: GeneratedQuizForPersistence,
): Promise<string> {
  return db.$transaction(async (tx) => {
    const quiz = await tx.quiz.upsert({
      where: { lessonId },
      create: {
        lessonId,
        title: generated.title,
        status: "READY",
        error: null,
      },
      update: {
        title: generated.title,
        status: "READY",
        error: null,
      },
    });

    await tx.question.deleteMany({ where: { quizId: quiz.id } });

    for (const [index, question] of generated.questions.entries()) {
      await tx.question.create({
        data: {
          quizId: quiz.id,
          prompt: question.prompt,
          explanation: question.explanation ?? null,
          sourceQuote: question.sourceQuote ?? null,
          order: index,
          options: {
            create: question.options.map((option, position) => ({
              text: option.text,
              isCorrect: option.isCorrect,
              order: position,
            })),
          },
        },
      });
    }

    return quiz.id;
  });
}

/**
 * Generate and store the quiz for one lesson.
 *
 * Never throws: quiz failure is recorded on the lesson's quiz row so the
 * instructor can see it and retry, rather than failing a lesson whose slides
 * generated perfectly well.
 */
export async function generateAndSaveQuiz(
  lessonId: string,
  options: { questionCount?: number | null } = {},
): Promise<QuizResult> {
  const source = await loadLessonSource(lessonId);
  if (!source) {
    const error = "The lesson has no generated slides to build a quiz from.";
    await recordFailure(lessonId, error);
    return { status: "ERROR", error };
  }

  try {
    const report = await generateQuiz(source, { questionCount: options.questionCount });

    if (report.quiz.questions.length < MIN_QUESTIONS) {
      const error =
        `No question could be grounded in this lesson. ` +
        `It may be too short or too sparse to quiz on — or you can write the questions yourself.`;
      await recordFailure(lessonId, error);
      return { status: "ERROR", error };
    }

    // Replace the questions, not the quiz. QuizAttempt points at the quiz row,
    // so deleting that row erased the gradebook through the cascade. Keeping
    // its id preserves every submitted attempt and its immutable score. The
    // old StudentAnswer detail is removed with the retired questions, while
    // the attempt's score/correctCount/totalCount remains available.
    const quizId = await saveGeneratedQuiz(lessonId, report.quiz);

    console.log(
      `[quiz] lesson ${lessonId}: ${report.quiz.questions.length} question(s) saved ` +
        `after ${report.passes} validation pass(es)` +
        (report.dropped.length ? `, ${report.dropped.length} dropped` : ""),
    );

    return {
      status: "READY",
      quizId,
      questionCount: report.quiz.questions.length,
      dropped: report.dropped.length,
      requested: report.requested,
      droppedReasons: [...new Set(report.dropped.map((d) => d.reason))].slice(0, 3),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Quiz generation failed";
    console.error(`[quiz] lesson ${lessonId} failed:`, message);
    await recordFailure(lessonId, message);
    return { status: "ERROR", error: message };
  }
}

/** Leave a visible, retryable record of why the quiz is missing. */
async function recordFailure(lessonId: string, error: string): Promise<void> {
  await db.quiz
    .upsert({
      where: { lessonId },
      create: { lessonId, title: "Quiz", status: "ERROR", error },
      update: { status: "ERROR", error },
    })
    .catch((err) => {
      console.error(`[quiz] could not record failure for lesson ${lessonId}:`, err);
    });
}
