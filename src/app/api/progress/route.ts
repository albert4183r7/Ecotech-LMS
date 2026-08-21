import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const enrollmentId = searchParams.get("enrollmentId");

    if (!enrollmentId) {
      return NextResponse.json(
        { success: false, error: "enrollmentId is required" },
        { status: 400 },
      );
    }

    const progresses = await db.progress.findMany({
      where: { enrollmentId },
      include: {
        lesson: {
          select: { id: true, title: true },
        },
      },
      orderBy: { lastAccessedAt: "desc" },
    });

    return NextResponse.json({ success: true, data: progresses });
  } catch (error) {
    console.error("Error fetching progress:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch progress" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    let actingUserId: string;
    try {
      actingUserId = (await requireUser()).id;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const body = await request.json();
    const { enrollmentId, lessonId, currentPage, completed } = body;

    if (!enrollmentId || !lessonId) {
      return NextResponse.json(
        { success: false, error: "enrollmentId and lessonId are required" },
        { status: 400 },
      );
    }

    // The enrolment has to be the caller's, or anyone could rewrite another
    // learner's progress by guessing an id.
    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true },
    });
    if (!enrollment || enrollment.userId !== actingUserId) {
      return NextResponse.json({ success: false, error: "Enrollment not found" }, { status: 404 });
    }

    // Verify lesson exists
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    // Upsert progress record
    const progress = await db.progress.upsert({
      where: {
        enrollmentId_lessonId: { enrollmentId, lessonId },
      },
      create: {
        enrollmentId,
        lessonId,
        currentPage: currentPage || 1,
        completed: completed || false,
        lastAccessedAt: new Date(),
      },
      update: {
        currentPage: currentPage || 1,
        completed: completed !== undefined ? completed : undefined,
        lastAccessedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, data: progress });
  } catch (error) {
    console.error("Error saving progress:", error);
    return NextResponse.json({ success: false, error: "Failed to save progress" }, { status: 500 });
  }
}
