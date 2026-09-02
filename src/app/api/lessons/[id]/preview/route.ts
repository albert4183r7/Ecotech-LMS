import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleRoute, ok } from "@/lib/api-response";
import { requireLessonOwner } from "@/lib/session";
import { SLIDE_TEMPLATE } from "@/lib/slides/template";
import { ensureCanvasDocument } from "@/lib/sanitize";

// ============================================
// GET /api/lessons/[id]/preview
//
// Everything the instructor's review screen needs in one request: the outline
// as approved, the slides as generated, and the quiz built from them — so the
// whole lesson can be inspected before it is published.
//
// Instructor-only, and only for their own lesson. This returns unpublished
// content, including quiz answers.
// ============================================

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("lessons.preview", async () => {
    const { id } = await params;
    await requireLessonOwner(id);

    const lesson = await db.lesson.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true, status: true } },
        sections: { orderBy: { order: "asc" } },
        slides: { orderBy: { order: "asc" } },
        quiz: {
          include: {
            questions: {
              orderBy: { order: "asc" },
              include: { options: { orderBy: { order: "asc" } } },
            },
          },
        },
        video: {
          include: { scenes: { orderBy: { order: "asc" } } },
        },
      },
    });
    if (!lesson) return ok(null);

    // The other lessons of the same course, so the review can run the way a
    // student does: this lesson, then its quiz, then the next lesson. Titles
    // only — the next lesson's slides are fetched when it is opened.
    const courseLessons = await db.lesson.findMany({
      where: { courseId: lesson.courseId },
      orderBy: { order: "asc" },
      select: { id: true, title: true, order: true },
    });

    const template = SLIDE_TEMPLATE;

    // An uploaded deck was never planned, so it has no outline — what it has
    // is where it came from, and the screen says so rather than telling the
    // instructor to regenerate a lesson nobody generated.
    const source = (() => {
      try {
        const parsed = JSON.parse(lesson.outlineJson ?? "{}") as {
          source?: { kind?: string; originalName?: string; file?: string };
        };
        return parsed.source?.kind ? parsed.source : null;
      } catch {
        return null;
      }
    })();

    return ok({
      id: lesson.id,
      title: lesson.title,
      source,
      order: lesson.order,
      course: lesson.course,
      /** Every lesson of the course, in order, including this one. */
      lessons: courseLessons,
      template: { id: template.id, label: template.label },
      sections: lesson.sections.map((section) => ({
        id: section.id,
        title: section.title,
        summary: section.summary,
        subtopics: JSON.parse(section.subtopics) as string[],
        slideBudget: section.slideBudget,
        order: section.order,
      })),
      slides: lesson.slides.map((slide) => ({
        id: slide.id,
        title: slide.title,
        // Render-ready rather than as-stored: a slide that predates the canvas
        // is re-wrapped and re-sanitized here, so the page can drop it into an
        // iframe without deciding for itself whether the stored HTML is safe.
        htmlBody: ensureCanvasDocument(slide.htmlBody, slide.title),
        status: slide.status,
        order: slide.order,
        sectionId: slide.sectionId,
        /** Whether field-level editing is available for this slide. */
        editable: Boolean(slide.contentJson),
      })),
      quiz: lesson.quiz
        ? {
            id: lesson.quiz.id,
            title: lesson.quiz.title,
            status: lesson.quiz.status,
            error: lesson.quiz.error,
            questions: lesson.quiz.questions.map((question) => ({
              id: question.id,
              prompt: question.prompt,
              explanation: question.explanation,
              sourceQuote: question.sourceQuote,
              order: question.order,
              options: question.options.map((option) => ({
                id: option.id,
                text: option.text,
                isCorrect: option.isCorrect,
                order: option.order,
              })),
            })),
          }
        : null,
      video: lesson.video
        ? {
            id: lesson.video.id,
            status: lesson.video.status,
            voice: lesson.video.voice,
            language: lesson.video.language,
            error: lesson.video.error,
            scenes: lesson.video.scenes.map((scene) => ({
              id: scene.id,
              slideId: scene.slideId,
              order: scene.order,
              narration: scene.narration,
              caption: scene.caption,
              audioUrl: scene.audioUrl,
              durationMs: scene.durationMs,
              status: scene.status,
              error: scene.error,
            })),
          }
        : null,
    });
  });
}
