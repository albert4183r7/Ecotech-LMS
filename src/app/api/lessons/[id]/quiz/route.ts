import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { requireLessonOwner } from "@/lib/session";
import { resolveQuizAccess, toQuizView } from "@/lib/quiz/access";
import { generateAndSaveQuiz } from "@/lib/quiz/persist";
import { AI_GENERATION_RULE, consumeAuthenticatedRequest } from "@/lib/rate-limit";

// ============================================
// /api/lessons/[id]/quiz
//
// GET  — the lesson's quiz, with answers only for the course's instructor.
// POST — regenerate it, instructor only. Recovery for a quiz that failed
//        while its slides generated fine; regenerating a lesson's slides
//        should not be necessary to get its quiz back.
// ============================================

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("lessons.quiz.GET", async () => {
    const { id } = await params;
    const { quiz, isOwner } = await resolveQuizAccess({ lessonId: id });
    return ok({ ...toQuizView(quiz, isOwner), canEdit: isOwner });
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("lessons.quiz.POST", async () => {
    const { id } = await params;
    const { user } = await requireLessonOwner(id);
    const limited = consumeAuthenticatedRequest(
      request.headers,
      user.id,
      "ai:quiz",
      AI_GENERATION_RULE,
    );
    if (!limited.allowed) {
      return fail(
        `Too many quiz generations. Try again in ${limited.retryAfterSeconds} seconds.`,
        429,
      );
    }

    // How many questions, when the instructor asked for a number. Regenerating
    // is where they most often want a different one.
    const body = (await request.json().catch(() => null)) as { questionCount?: number } | null;

    const ready = await db.slide.count({ where: { lessonId: id, status: "READY" } });
    if (ready === 0) {
      return fail("Generate the lesson's slides before generating its quiz.", 400);
    }

    const result = await generateAndSaveQuiz(id, { questionCount: body?.questionCount });
    if (result.status === "ERROR") {
      return fail(result.error ?? "Quiz generation failed.", 502);
    }
    return ok(result);
  });
}
