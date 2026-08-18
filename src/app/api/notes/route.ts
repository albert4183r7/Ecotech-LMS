import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/notes?userId=xxx&courseId=xxx&lessonId=xxx
 * List notes for a user/course/lesson
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const courseId = searchParams.get("courseId");
    const lessonId = searchParams.get("lessonId");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const where: Record<string, string> = { userId };
    if (courseId) where.courseId = courseId;
    if (lessonId) where.lessonId = lessonId;

    const notes = await db.note.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ success: true, data: notes });
  } catch (error) {
    console.error("GET /api/notes error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch notes" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notes
 * Create a new note
 * Body: { userId, courseId, lessonId, content, slideNumber?, isBookmarked? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, courseId, lessonId, content, slideNumber, isBookmarked } = body;

    if (!content?.trim() || !userId || !courseId || !lessonId) {
      return NextResponse.json(
        { success: false, error: "content, userId, courseId, and lessonId are required" },
        { status: 400 }
      );
    }

    // Validate user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Validate course exists
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json(
        { success: false, error: "Course not found" },
        { status: 404 }
      );
    }

    // Validate lesson exists
    const lesson = await db.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      return NextResponse.json(
        { success: false, error: "Lesson not found" },
        { status: 404 }
      );
    }

    const note = await db.note.create({
      data: {
        content: content.trim(),
        slideNumber: slideNumber ?? 0,
        isBookmarked: isBookmarked ?? false,
        userId,
        courseId,
        lessonId,
      },
    });

    return NextResponse.json({ success: true, data: note }, { status: 201 });
  } catch (error) {
    console.error("POST /api/notes error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create note" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/notes
 * Update a note
 * Body: { id, content?, isBookmarked? }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, content, isBookmarked } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 }
      );
    }

    const note = await db.note.findUnique({ where: { id } });
    if (!note) {
      return NextResponse.json(
        { success: false, error: "Note not found" },
        { status: 404 }
      );
    }

    const updatedNote = await db.note.update({
      where: { id },
      data: {
        ...(content !== undefined && { content: content.trim() }),
        ...(isBookmarked !== undefined && { isBookmarked }),
      },
    });

    return NextResponse.json({ success: true, data: updatedNote });
  } catch (error) {
    console.error("PUT /api/notes error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update note" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notes?id=xxx
 * Delete a note
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "id is required" },
        { status: 400 }
      );
    }

    const note = await db.note.findUnique({ where: { id } });
    if (!note) {
      return NextResponse.json(
        { success: false, error: "Note not found" },
        { status: 404 }
      );
    }

    await db.note.delete({ where: { id } });

    return NextResponse.json({ success: true, data: note });
  } catch (error) {
    console.error("DELETE /api/notes error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete note" },
      { status: 500 }
    );
  }
}
