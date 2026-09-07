import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";
import { authFailure } from "@/lib/api-response";
import { refreshRiskSnapshot } from "@/lib/analytics/risk";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const enrollmentId = searchParams.get("enrollmentId");

    // Progress belongs to an enrolment, and an enrolment to a person. Reading
    // it needs both: a session, and that session owning the enrolment. The
    // enrolment id was previously taken on trust, so anyone could read another
    // student's progress through a course.
    const actingUserId = (await requireUser()).id;

    if (!enrollmentId) {
      return NextResponse.json(
        { success: false, error: "enrollmentId is required" },
        { status: 400 },
      );
    }

    const enrollment = await db.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true, courseId: true, status: true },
    });
    if (!enrollment || enrollment.userId !== actingUserId || enrollment.status === "dropped") {
      return NextResponse.json({ success: false, error: "Enrollment not found" }, { status: 404 });
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
    const denied = authFailure(error);
    if (denied) return denied;
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
      const denied = authFailure(error);
      if (denied) return denied;
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
      select: { userId: true, courseId: true, status: true },
    });
    if (!enrollment || enrollment.userId !== actingUserId || enrollment.status === "dropped") {
      return NextResponse.json({ success: false, error: "Enrollment not found" }, { status: 404 });
    }

    // Verify lesson exists
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    // Progress is only meaningful inside the course the enrolment belongs to.
    // Checking the two rows independently allowed a learner to complete course
    // A by posting lesson ids from course B.
    if (lesson.courseId !== enrollment.courseId) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    if (currentPage !== undefined && (!Number.isInteger(currentPage) || currentPage < 1)) {
      return NextResponse.json(
        { success: false, error: "currentPage must be a positive integer" },
        { status: 400 },
      );
    }

    // Upsert progress record
    const progress = await db.progress.upsert({
      where: {
        enrollmentId_lessonId: { enrollmentId, lessonId },
      },
      create: {
        enrollmentId,
        lessonId,
        currentPage: currentPage ?? 1,
        completed: completed ?? false,
        lastAccessedAt: new Date(),
      },
      update: {
        // Omitting a page while marking completion must not rewind a learner.
        ...(currentPage !== undefined && { currentPage }),
        completed: completed !== undefined ? completed : undefined,
        lastAccessedAt: new Date(),
      },
    });

    // ---- Roll the lesson up into the course ----
    //
    // Percentage is derived from these rows wherever it is shown, but the
    // enrolment's own status was set once at enrolment and never again — so a
    // learner who finished every lesson stayed "in progress" for ever and the
    // completed list stayed empty. Recomputed here, where the last lesson is
    // marked done.
    const [totalLessons, completedLessons] = await Promise.all([
      db.lesson.count({ where: { courseId: enrollment.courseId } }),
      db.progress.count({
        where: {
          enrollmentId,
          completed: true,
          lesson: { courseId: enrollment.courseId },
        },
      }),
    ]);
    const percent =
      totalLessons > 0
        ? Math.round((Math.min(completedLessons, totalLessons) / totalLessons) * 100)
        : 0;
    const finished = totalLessons > 0 && completedLessons >= totalLessons;

    await db.enrollment.update({
      where: { id: enrollmentId },
      data: {
        status: finished ? "completed" : "in_progress",
        ...(finished ? {} : { completedAt: null }),
      },
    });
    if (finished) {
      // Stamped the first time the course is finished and left alone after,
      // so revisiting a lesson does not reset when it was completed.
      await db.enrollment.updateMany({
        where: { id: enrollmentId, completedAt: null },
        data: { completedAt: new Date() },
      });
    }

    await refreshRiskSnapshot(enrollmentId).catch((error) =>
      console.error("[risk] progress-triggered refresh failed:", error),
    );

    return NextResponse.json({
      success: true,
      data: { ...progress, courseProgress: percent, courseCompleted: finished },
    });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error saving progress:", error);
    return NextResponse.json({ success: false, error: "Failed to save progress" }, { status: 500 });
  }
}
