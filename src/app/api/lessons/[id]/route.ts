import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, order, outlineJson } = body;

    const lesson = await db.lesson.findUnique({ where: { id } });
    if (!lesson) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    const updated = await db.lesson.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(order !== undefined && { order }),
        ...(outlineJson !== undefined && { outlineJson }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating lesson:", error);
    return NextResponse.json({ success: false, error: "Failed to update lesson" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const lesson = await db.lesson.findUnique({ where: { id } });
    if (!lesson) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    // Slides are cascade-deleted by the relation
    await db.lesson.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    return NextResponse.json({ success: false, error: "Failed to delete lesson" }, { status: 500 });
  }
}
