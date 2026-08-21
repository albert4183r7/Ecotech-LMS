import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { resolveQuizAccess, toQuizView } from "@/lib/quiz/access";
import { AuthorizationError } from "@/lib/session";
import { OPTIONS_PER_QUESTION } from "@/lib/quiz/schema";

// ============================================
// PUT /api/quizzes/[id]
//
// Instructor edits to a generated quiz: the question, its options, which one
// is correct, and the explanation. Editing a question does not regenerate
// anything — the point of editing is to keep what is there and change one
// part of it.
// ============================================

const EditSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  questions: z
    .array(
      z.object({
        id: z.string().min(1),
        prompt: z.string().min(10).max(400).optional(),
        explanation: z.string().max(400).nullable().optional(),
        options: z
          .array(
            z.object({
              id: z.string().min(1),
              text: z.string().min(1).max(200).optional(),
              isCorrect: z.boolean().optional(),
            }),
          )
          .max(OPTIONS_PER_QUESTION)
          .optional(),
      }),
    )
    .optional(),
});

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("quizzes.PUT", async () => {
    const { id } = await params;
    const { quiz, isOwner } = await resolveQuizAccess({ quizId: id });
    if (!isOwner) throw new AuthorizationError("Quiz not found.", 404);

    const parsed = EditSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail(
        `Invalid edit: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
        400,
      );
    }
    const edit = parsed.data;

    // Only ids that belong to this quiz may be touched, so an edit cannot
    // reach into another instructor's quiz by supplying a foreign id.
    const ownQuestions = new Map(quiz.questions.map((q) => [q.id, q]));

    for (const question of edit.questions ?? []) {
      const existing = ownQuestions.get(question.id);
      if (!existing) return fail(`Question ${question.id} is not part of this quiz.`, 400);

      if (question.options) {
        const ownOptions = new Set(existing.options.map((o) => o.id));
        for (const option of question.options) {
          if (!ownOptions.has(option.id)) {
            return fail(`Option ${option.id} is not part of question ${question.id}.`, 400);
          }
        }
        // An MCQ with no correct answer, or several, cannot be scored.
        const flags = existing.options.map((existingOption) => {
          const change = question.options?.find((o) => o.id === existingOption.id);
          return change?.isCorrect ?? existingOption.isCorrect;
        });
        const correct = flags.filter(Boolean).length;
        if (correct !== 1) {
          return fail(
            `Question "${(question.prompt ?? existing.prompt).slice(0, 60)}" would have ${correct} correct answers; exactly one is required.`,
            400,
          );
        }
      }
    }

    await db.$transaction(async (tx) => {
      if (edit.title !== undefined) {
        await tx.quiz.update({ where: { id: quiz.id }, data: { title: edit.title } });
      }
      for (const question of edit.questions ?? []) {
        await tx.question.update({
          where: { id: question.id },
          data: {
            ...(question.prompt !== undefined && { prompt: question.prompt }),
            ...(question.explanation !== undefined && { explanation: question.explanation }),
          },
        });
        for (const option of question.options ?? []) {
          await tx.option.update({
            where: { id: option.id },
            data: {
              ...(option.text !== undefined && { text: option.text }),
              ...(option.isCorrect !== undefined && { isCorrect: option.isCorrect }),
            },
          });
        }
      }
    });

    const updated = await db.quiz.findUnique({
      where: { id: quiz.id },
      include: {
        lesson: { select: { id: true, title: true, courseId: true, order: true } },
        questions: {
          orderBy: { order: "asc" },
          include: { options: { orderBy: { order: "asc" } } },
        },
      },
    });
    return ok({ ...toQuizView(updated!, true), canEdit: true });
  });
}
