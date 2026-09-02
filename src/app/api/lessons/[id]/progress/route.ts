import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { requireLessonOwner } from "@/lib/session";

// ============================================
// GET /api/lessons/[id]/progress
//
// What stage a lesson's generation is at, and nothing else.
//
// The Create Course page used to poll /api/lessons/[id] every few seconds,
// which returns the full HTML document of every slide. Once a deck had a dozen
// slides that was hundreds of kilobytes per poll, so the answer to "are the
// slides ready yet?" arrived long after they were. This carries statuses only,
// which is what the poll actually reads.
//
// It also names the stage the workflow is in. Slides are followed by a review
// pass and then quiz + narrated-video generation, which run in parallel —
// without a name for that stretch the page looked stuck on a finished deck.
// ============================================

/**
 * The gap between the last slide being written and the workflow marking its
 * quiz DRAFT, during which a lesson is still assumed to be finishing.
 *
 * The DRAFT row is the real signal; this only covers the moment before it is
 * written. It stays short on purpose: a lesson that simply has no quiz — the
 * seeded lessons, or any generated before quizzes existed — must not report
 * itself as forever "finishing".
 */
const FINISHING_WINDOW_MS = 60_000;

/** Where a lesson is in the generate → review → media workflow. */
export type LessonStage =
  /** Slides are still being written. */
  | "slides"
  /** Every slide has settled; review, quiz, or narrated video is still running. */
  | "media"
  /** Slides, quiz, and narrated video are settled — the lesson can be reviewed. */
  | "ready"
  /** Nothing generated, so no review or quiz will follow. */
  | "failed";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("lessons.progress", async () => {
    const { id } = await params;
    await requireLessonOwner(id);

    const lesson = await db.lesson.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slides: {
          orderBy: { order: "asc" },
          // No htmlBody: this endpoint exists precisely to leave it out.
          select: { id: true, title: true, status: true, order: true, updatedAt: true },
        },
        quiz: {
          select: { id: true, status: true, error: true, _count: { select: { questions: true } } },
        },
        video: {
          select: {
            id: true,
            status: true,
            error: true,
            scenes: { select: { status: true } },
          },
        },
      },
    });
    if (!lesson) return fail("Lesson not found.", 404);

    const slides = lesson.slides;
    const ready = slides.filter((s) => s.status === "READY").length;
    const errored = slides.filter((s) => s.status === "ERROR").length;
    const generating = slides.find((s) => s.status === "GENERATING") ?? null;
    const settled = ready + errored;

    // Each artifact owns its own terminal state. One can fail while the other
    // still completes, so the lesson remains in media until both have settled.
    const quizPending = lesson.quiz?.status === "DRAFT";
    const videoPending = lesson.video?.status === "DRAFT" || lesson.video?.status === "GENERATING";
    const lastWrite = slides.reduce((latest, s) => Math.max(latest, s.updatedAt.getTime()), 0);
    const justWritten = Date.now() - lastWrite < FINISHING_WINDOW_MS;

    const stage: LessonStage =
      settled < slides.length || slides.length === 0
        ? "slides"
        : ready === 0
          ? // A lesson with no ready slide never starts a quiz, so waiting for
            // one would leave the page spinning forever.
            "failed"
          : quizPending ||
              videoPending ||
              (errored === 0 && !lesson.quiz && !lesson.video && justWritten)
            ? "media"
            : "ready";

    const videoScenes = lesson.video?.scenes ?? [];

    return ok({
      lessonId: lesson.id,
      title: lesson.title,
      stage,
      done: stage === "ready" || stage === "failed",
      totalSlides: slides.length,
      readySlides: ready,
      errorSlides: errored,
      generatingSlideId: generating?.id ?? null,
      slides: slides.map((slide) => ({
        id: slide.id,
        title: slide.title,
        status: slide.status,
        order: slide.order,
      })),
      quiz: lesson.quiz
        ? {
            id: lesson.quiz.id,
            status: lesson.quiz.status,
            error: lesson.quiz.error,
            questionCount: lesson.quiz._count.questions,
          }
        : null,
      video: lesson.video
        ? {
            id: lesson.video.id,
            status: lesson.video.status,
            error: lesson.video.error,
            readyScenes: videoScenes.filter((scene) => scene.status === "READY").length,
            errorScenes: videoScenes.filter((scene) => scene.status === "ERROR").length,
            totalScenes: videoScenes.length,
          }
        : null,
    });
  });
}
