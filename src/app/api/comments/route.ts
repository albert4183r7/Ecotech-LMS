import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/comments?courseId=xxx&lessonId=xxx
 * List comments for a course/lesson (newest first, with nested replies)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");
    const lessonId = searchParams.get("lessonId");

    if (!courseId) {
      return NextResponse.json(
        { success: false, error: "courseId is required" },
        { status: 400 }
      );
    }

    // Fetch top-level comments (no parentId) for this course/lesson
    const comments = await db.comment.findMany({
      where: {
        courseId,
        lessonId: lessonId || null,
        parentId: null,
      },
      include: {
        author: {
          select: { id: true, name: true, avatar: true, role: true },
        },
        replies: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: { id: true, name: true, avatar: true, role: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: comments });
  } catch (error) {
    console.error("GET /api/comments error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch comments" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comments
 * Create a new comment
 * Body: { content, courseId, lessonId?, parentId?, userId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, courseId, lessonId, parentId, userId } = body;

    if (!content?.trim() || !courseId || !userId) {
      return NextResponse.json(
        { success: false, error: "content, courseId, and userId are required" },
        { status: 400 }
      );
    }

    // Validate courseId exists
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json(
        { success: false, error: "Course not found" },
        { status: 404 }
      );
    }

    // Validate userId exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    // Validate parentId if provided
    if (parentId) {
      const parentComment = await db.comment.findUnique({
        where: { id: parentId },
      });
      if (!parentComment) {
        return NextResponse.json(
          { success: false, error: "Parent comment not found" },
          { status: 404 }
        );
      }
    }

    const comment = await db.comment.create({
      data: {
        content: content.trim(),
        courseId,
        lessonId: lessonId || null,
        parentId: parentId || null,
        userId,
      },
      include: {
        author: {
          select: { id: true, name: true, avatar: true, role: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: comment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/comments error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create comment" },
      { status: 500 }
    );
  }
}
