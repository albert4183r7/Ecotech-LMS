import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleRoute, ok } from "@/lib/api-response";
import { requireLessonOwner } from "@/lib/session";
import { readLessonTemplateId } from "@/lib/slides/lesson-template";
import { templateFor } from "@/lib/slides/template";

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
      },
    });
    if (!lesson) return ok(null);

    const templateId = readLessonTemplateId(lesson.outlineJson);
    const template = templateFor(templateId);

    return ok({
      id: lesson.id,
      title: lesson.title,
      order: lesson.order,
      course: lesson.course,
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
        htmlBody: slide.htmlBody,
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
              imageUrl: question.imageUrl,
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
    });
  });
}
