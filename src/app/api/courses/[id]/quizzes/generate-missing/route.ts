import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleRoute, ok } from "@/lib/api-response";
import { requireCourseOwner } from "@/lib/session";
import { generateAndSaveQuiz } from "@/lib/quiz/persist";
import { AI_GENERATION_RULE, consumeAuthenticatedRequest } from "@/lib/rate-limit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("courses.quizzes.generate-missing.POST", async () => {
    const { id } = await params;
    const user = await requireCourseOwner(id);
    const limited = consumeAuthenticatedRequest(
      request.headers,
      user.id,
      "ai:missing-quizzes",
      AI_GENERATION_RULE,
    );
    if (!limited.allowed) return fail("Quiz generation limit reached. Try again later.", 429);

    const body = (await request.json().catch(() => null)) as { lessonIds?: string[] } | null;
    const requested = Array.isArray(body?.lessonIds) ? new Set(body.lessonIds) : null;
    const lessons = await db.lesson.findMany({
      where: { courseId: id, ...(requested ? { id: { in: [...requested] } } : {}) },
      orderBy: { order: "asc" },
      include: {
        quiz: { select: { status: true } },
        slides: { where: { status: "READY" }, select: { id: true }, take: 1 },
      },
    });
    const missing = lessons.filter(
      (lesson) => lesson.slides.length > 0 && lesson.quiz?.status !== "READY",
    );
    if (missing.length === 0)
      return ok({
        generated: 0,
        failed: [],
        message: "All generated lessons already have quizzes.",
      });

    const failed: { lessonId: string; title: string; error: string }[] = [];
    let generated = 0;
    for (const lesson of missing) {
      try {
        const result = await generateAndSaveQuiz(lesson.id);
        if (result.status === "READY") generated++;
        else
          failed.push({
            lessonId: lesson.id,
            title: lesson.title,
            error: result.error ?? "Generation failed",
          });
      } catch (error) {
        failed.push({
          lessonId: lesson.id,
          title: lesson.title,
          error: error instanceof Error ? error.message : "Generation failed",
        });
      }
    }
    return ok({ generated, failed });
  });
}
