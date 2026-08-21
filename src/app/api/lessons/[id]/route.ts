import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireLessonOwner } from "@/lib/session";
import { handleRoute, ok, fail } from "@/lib/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const lesson = await db.lesson.findUnique({
      where: { id },
      include: {
        slides: {
          orderBy: { order: "asc" },
        },
        // The quiz is the last stage of generating a lesson, so the client
        // needs its state to know whether the workflow has actually finished.
        quiz: {
          select: { id: true, status: true, error: true, _count: { select: { questions: true } } },
        },
      },
    });

    if (!lesson) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    const formattedLesson = {
      id: lesson.id,
      title: lesson.title,
      order: lesson.order,
      outlineJson: lesson.outlineJson,
      courseId: lesson.courseId,
      slides: lesson.slides.map((slide) => ({
        id: slide.id,
        title: slide.title,
        htmlBody: slide.htmlBody,
        status: slide.status,
        order: slide.order,
        lessonId: slide.lessonId,
        createdAt: slide.createdAt,
        updatedAt: slide.updatedAt,
      })),
      quiz: lesson.quiz
        ? {
            id: lesson.quiz.id,
            status: lesson.quiz.status,
            error: lesson.quiz.error,
            questionCount: lesson.quiz._count.questions,
          }
        : null,
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt,
    };

    return NextResponse.json({ success: true, data: formattedLesson });
  } catch (error) {
    console.error("Error fetching lesson:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch lesson" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("lessons.PUT", async () => {
    const { id } = await params;
    // Only the instructor whose course this lesson belongs to.
    await requireLessonOwner(id);

    const body = await request.json();
    const { title, order, outlineJson } = body;

    const lesson = await db.lesson.findUnique({ where: { id } });
    if (!lesson) return fail("Lesson not found.", 404);

    const updated = await db.lesson.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(order !== undefined && { order }),
        ...(outlineJson !== undefined && { outlineJson }),
      },
    });

    return ok(updated);
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute("lessons.DELETE", async () => {
    const { id } = await params;
    await requireLessonOwner(id);

    const lesson = await db.lesson.findUnique({ where: { id } });
    if (!lesson) return fail("Lesson not found.", 404);

    // Sections, slides and the quiz are cascade-deleted by their relations;
    // agent runs are SetNull and would otherwise point at a lesson that has
    // gone, so they are removed with it.
    await db.$transaction(async (tx) => {
      await tx.agentRun.deleteMany({ where: { lessonId: id } });
      await tx.lesson.delete({ where: { id } });
    });

    return ok({ id });
  });
}
