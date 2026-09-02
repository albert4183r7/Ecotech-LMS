import { db } from "@/lib/db";
import { AuthorizationError, requireUser, type SessionUser } from "@/lib/session";

// ============================================
// Quiz access
//
// Who may see a quiz, and how much of it. An instructor sees which option is
// correct because they have to review it; a student must not, or the quiz is
// pointless — so the correct answers are removed on the server, not hidden in
// the UI where the network tab would show them anyway.
// ============================================

export interface QuizOptionView {
  id: string;
  text: string;
  order: number;
  /** Present only for the instructor view. */
  isCorrect?: boolean;
}

export interface QuizQuestionView {
  id: string;
  prompt: string;
  order: number;
  options: QuizOptionView[];
  /** Instructor view only. */
  explanation?: string | null;
  sourceQuote?: string | null;
}

export interface QuizView {
  id: string;
  title: string;
  status: string;
  error: string | null;
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  questionCount: number;
  questions: QuizQuestionView[];
}

type QuizWithRelations = NonNullable<Awaited<ReturnType<typeof loadQuiz>>>;

export async function loadQuiz(where: { quizId?: string; lessonId?: string }) {
  if (!where.quizId && !where.lessonId) return null;
  return db.quiz.findFirst({
    where: where.quizId ? { id: where.quizId } : { lessonId: where.lessonId },
    include: {
      lesson: { select: { id: true, title: true, courseId: true, order: true } },
      questions: {
        orderBy: { order: "asc" },
        include: { options: { orderBy: { order: "asc" } } },
      },
    },
  });
}

/** Shape a quiz for its audience. `reveal` gates everything answer-bearing. */
export function toQuizView(quiz: QuizWithRelations, reveal: boolean): QuizView {
  return {
    id: quiz.id,
    title: quiz.title,
    status: quiz.status,
    error: quiz.error,
    lessonId: quiz.lesson.id,
    lessonTitle: quiz.lesson.title,
    courseId: quiz.lesson.courseId,
    questionCount: quiz.questions.length,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      order: question.order,
      ...(reveal ? { explanation: question.explanation, sourceQuote: question.sourceQuote } : {}),
      options: question.options.map((option) => ({
        id: option.id,
        text: option.text,
        order: option.order,
        ...(reveal ? { isCorrect: option.isCorrect } : {}),
      })),
    })),
  };
}

export interface QuizAccess {
  user: SessionUser;
  quiz: QuizWithRelations;
  /** True when the caller owns the course and may see the answers. */
  isOwner: boolean;
  /** Set when the caller reached the quiz as an enrolled student. */
  enrollmentId?: string;
}

/**
 * Resolve a quiz for the caller, or refuse.
 *
 * The instructor path and the student path are both checked here rather than
 * at each route, because they must never diverge: a student reaching a quiz
 * requires the course to be published AND an enrolment, and neither alone is
 * enough.
 *
 * A quiz the caller has no business knowing about is reported as not-found, so
 * the endpoint does not confirm which quizzes exist. The one exception is a
 * published course the caller simply has not enrolled in: its lessons are
 * already listed publicly, so there is nothing to conceal, and 403 with "you
 * are not enrolled" tells the student what to do about it.
 */
export async function resolveQuizAccess(where: {
  quizId?: string;
  lessonId?: string;
}): Promise<QuizAccess> {
  const user = await requireUser();
  const quiz = await loadQuiz(where);
  if (!quiz) throw new AuthorizationError("Quiz not found.", 404);

  const course = await db.course.findUnique({
    where: { id: quiz.lesson.courseId },
    select: { creatorId: true, status: true },
  });
  if (!course) throw new AuthorizationError("Quiz not found.", 404);

  if (user.role === "instructor" && course.creatorId === user.id) {
    return { user, quiz, isOwner: true };
  }

  if (user.role !== "student") {
    throw new AuthorizationError("Sign in as a Student to take this quiz.", 403);
  }

  if (course.status !== "published") {
    throw new AuthorizationError("Quiz not found.", 404);
  }

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: user.id, courseId: quiz.lesson.courseId } },
    select: { id: true },
  });
  if (!enrollment) {
    throw new AuthorizationError("You are not enrolled in this course.", 403);
  }

  return { user, quiz, isOwner: false, enrollmentId: enrollment.id };
}
