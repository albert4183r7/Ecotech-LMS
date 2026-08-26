import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { resolveQuizAccess } from "@/lib/quiz/access";
import { AuthorizationError } from "@/lib/session";

// ============================================
// DELETE /api/quizzes/[id]/questions/[questionId]
//
// Remove one question. The pair of adding one: a quiz an instructor can add
// to and never take from is one where a mistyped question is permanent.
//
// The last question is kept: a quiz with none is not a quiz, and the row's
// READY status would then promise learners something that cannot be taken.
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; questionId: string }> },
) {
  return handleRoute("quizzes.questions.DELETE", async () => {
    const { id, questionId } = await params;
    const { quiz, isOwner } = await resolveQuizAccess({ quizId: id });
    if (!isOwner) throw new AuthorizationError("Quiz not found.", 404);

    const question = quiz.questions.find((q) => q.id === questionId);
    if (!question) return fail("That question is not part of this quiz.", 404);
    if (quiz.questions.length <= 1) {
      return fail("A quiz needs at least one question. Add another before removing this one.", 400);
    }

    await db.$transaction(async (tx) => {
      await tx.question.delete({ where: { id: questionId } });
      // Positions close up, so the order a learner sees has no gaps in it.
      const remaining = quiz.questions.filter((q) => q.id !== questionId);
      await Promise.all(
        remaining.map((q, index) =>
          q.order === index
            ? Promise.resolve()
            : tx.question.update({ where: { id: q.id }, data: { order: index } }),
        ),
      );
    });

    return ok({ id: questionId, remaining: quiz.questions.length - 1 });
  });
}
