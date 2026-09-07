import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { resolveQuizAccess } from "@/lib/quiz/access";
import { refreshRiskSnapshot } from "@/lib/analytics/risk";

// ============================================
// POST /api/quizzes/[id]/attempts
//
// Submit a quiz and get it back scored. Scoring happens here, from the stored
// options, and never from anything the client sent: the request says which
// option was chosen, not whether it was right.
//
// GET returns the caller's own attempts on this quiz.
// ============================================

interface SubmitRequest {
  /** questionId -> optionId. A question the learner skipped may be omitted. */
  answers: Record<string, string>;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("quizzes.attempts.POST", async () => {
    const { id } = await params;
    const { user, quiz, isOwner, enrollmentId } = await resolveQuizAccess({ quizId: id });

    if (isOwner) {
      // An instructor previewing their own quiz should not be recorded as
      // having sat it; their attempt would pollute the course's results.
      return fail("Instructors cannot submit attempts for their own quiz.", 403);
    }
    if (quiz.status !== "READY" || quiz.questions.length === 0) {
      return fail("This quiz is not ready yet.", 400);
    }

    const body = (await request.json()) as SubmitRequest;
    const answers = body?.answers ?? {};
    // An array passes `typeof === "object"`, so the old check let a
    // wrongly-shaped submission through to be scored as three blanks. A
    // student who answered would have been told they got nothing right, with
    // no error anywhere to say why.
    if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
      return fail("answers must be an object of questionId to optionId.", 400);
    }

    // Skipping a question is allowed — leaving its key out. Naming a question
    // or an option that is not part of this quiz is not: it means the client
    // and the quiz disagree, and scoring that silently produces a wrong mark.
    const questionsById = new Map(quiz.questions.map((q) => [q.id, q]));
    for (const [questionId, optionId] of Object.entries(answers)) {
      const question = questionsById.get(questionId);
      if (!question) return fail(`Question ${questionId} is not part of this quiz.`, 400);
      if (typeof optionId !== "string" || !question.options.some((o) => o.id === optionId)) {
        return fail(`Option ${String(optionId)} is not an answer to question ${questionId}.`, 400);
      }
    }

    // Score from the database, question by question. Which option was chosen
    // comes from the request; whether it was right never does.
    const graded = quiz.questions.map((question) => {
      const selectedOptionId = answers[question.id] ?? null;
      const selected = question.options.find((o) => o.id === selectedOptionId) ?? null;
      return {
        questionId: question.id,
        selectedOptionId: selected?.id ?? null,
        isCorrect: selected?.isCorrect === true,
      };
    });

    const correctCount = graded.filter((g) => g.isCorrect).length;
    const totalCount = graded.length;
    const score = Math.round((correctCount / totalCount) * 100);

    const attempt = await db.$transaction(async (tx) => {
      const created = await tx.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId: user.id,
          enrollmentId: enrollmentId ?? null,
          score,
          correctCount,
          totalCount,
        },
      });
      await tx.studentAnswer.createMany({
        data: graded.map((g) => ({
          attemptId: created.id,
          questionId: g.questionId,
          selectedOptionId: g.selectedOptionId,
          isCorrect: g.isCorrect,
        })),
      });
      return created;
    });

    if (enrollmentId) {
      await refreshRiskSnapshot(enrollmentId).catch((error) =>
        console.error("[risk] quiz-triggered refresh failed:", error),
      );
    }

    // The full result, including the correct answers — which is exactly what
    // the learner is now entitled to see, having submitted.
    return ok({
      attemptId: attempt.id,
      score,
      correctCount,
      totalCount,
      submittedAt: attempt.submittedAt,
      results: quiz.questions.map((question) => {
        const answer = graded.find((g) => g.questionId === question.id)!;
        const correctOption = question.options.find((o) => o.isCorrect);
        return {
          questionId: question.id,
          prompt: question.prompt,
          explanation: question.explanation,
          isCorrect: answer.isCorrect,
          selectedOptionId: answer.selectedOptionId,
          correctOptionId: correctOption?.id ?? null,
          options: question.options.map((o) => ({
            id: o.id,
            text: o.text,
            order: o.order,
            isCorrect: o.isCorrect,
          })),
        };
      }),
    });
  });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("quizzes.attempts.GET", async () => {
    const { id } = await params;
    const { user, quiz } = await resolveQuizAccess({ quizId: id });

    const attempts = await db.quizAttempt.findMany({
      where: { quizId: quiz.id, userId: user.id },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        score: true,
        correctCount: true,
        totalCount: true,
        submittedAt: true,
      },
    });
    return ok(attempts);
  });
}
