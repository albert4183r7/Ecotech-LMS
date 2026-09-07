import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { resolveQuizAccess, toQuizView } from "@/lib/quiz/access";
import { AuthorizationError } from "@/lib/session";
import { OPTIONS_PER_QUESTION } from "@/lib/quiz/schema";
import { appendManualQuestion } from "@/lib/quiz/questions";

// ============================================
// POST /api/quizzes/[id]/questions
//
// A question the instructor wrote themselves.
//
// The generated ones are grounded in the lesson and checked against it; this
// one is not, and does not pretend to be — it has no source quote, because
// its source is the person who wrote it. An instructor who knows the material
// should be able to ask something the generator did not think of without
// regenerating the whole quiz.
// ============================================

const NewQuestionSchema = z.object({
  prompt: z.string().trim().min(10).max(400),
  explanation: z.string().trim().max(400).optional(),
  options: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(200),
        isCorrect: z.boolean(),
      }),
    )
    .min(2)
    .max(OPTIONS_PER_QUESTION),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("quizzes.questions.POST", async () => {
    const { id } = await params;
    const { quiz, isOwner } = await resolveQuizAccess({ quizId: id });
    if (!isOwner) throw new AuthorizationError("Quiz not found.", 404);

    const parsed = NewQuestionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail(
        `Invalid question: ${parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")}`,
        400,
      );
    }
    const draft = parsed.data;

    // The same rule the editor enforces: an MCQ with no correct answer, or
    // several, cannot be scored.
    const correct = draft.options.filter((o) => o.isCorrect).length;
    if (correct !== 1) {
      return fail(`A question needs exactly one correct answer; this one has ${correct}.`, 400);
    }
    const texts = new Set(draft.options.map((o) => o.text.toLowerCase()));
    if (texts.size !== draft.options.length) {
      return fail("Every answer choice must be different.", 400);
    }

    await appendManualQuestion(quiz.id, draft);

    const updated = await db.quiz.findUnique({
      where: { id: quiz.id },
      include: {
        lesson: {
          select: { id: true, title: true, courseId: true, order: true, outlineJson: true },
        },
        questions: {
          orderBy: { order: "asc" },
          include: { options: { orderBy: { order: "asc" } } },
        },
      },
    });
    return ok({ ...toQuizView(updated!, true), canEdit: true });
  });
}
