import { NextRequest, NextResponse } from "next/server";
import { authFailure } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wantsRoster = searchParams.get("creatorId") !== null;

    // Both shapes are about the caller: your own enrolments, or the roster of
    // the courses you teach. The ids used to come from the query string, so
    // anyone could read another student's enrolments or another instructor's
    // student list by naming them.
    const user = await requireUser();
    const userId = user.id;

    if (wantsRoster) {
      const enrollments = await db.enrollment.findMany({
        where: {
          course: { creatorId: userId },
        },
        include: {
          user: {
            select: { id: true, name: true, avatar: true },
          },
          course: {
            select: {
              id: true,
              title: true,
            },
          },
        },
        orderBy: { enrolledAt: "desc" },
        take: 20,
      });

      const formatted = enrollments.map((e) => ({
        id: e.id,
        studentName: e.user.name || "Anonymous Student",
        studentAvatar: e.user.avatar,
        courseTitle: e.course.title,
        enrolledAt: e.enrolledAt,
      }));

      return NextResponse.json({ success: true, data: formatted });
    }

    const enrollments = await db.enrollment.findMany({
      where: { userId, status: { not: "dropped" } },
      include: {
        course: {
          include: {
            category: true,
            _count: {
              select: { lessons: true },
            },
          },
        },
        progresses: {
          include: {
            lesson: {
              select: { id: true, title: true, courseId: true },
            },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    const formattedEnrollments = enrollments.map((enrollment) => {
      const totalLessons = enrollment.course._count.lessons;
      const completedLessons = enrollment.progresses.filter(
        (p) => p.completed && p.lesson.courseId === enrollment.courseId,
      ).length;
      const totalProgress =
        totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: enrollment.id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
        progress: totalProgress,
        /** The course this enrolment is for, beside the nested course itself:
         *  callers match on an id and the nesting was easy to miss. */
        courseId: enrollment.courseId,
        course: {
          id: enrollment.course.id,
          title: enrollment.course.title,
          description: enrollment.course.description,
          coverImage: enrollment.course.coverImage,
          rating: enrollment.course.rating,
          language: enrollment.course.language,
          category: enrollment.course.category
            ? {
                id: enrollment.course.category.id,
                name: enrollment.course.category.name,
                color: enrollment.course.category.color,
              }
            : null,
          lessonsCount: enrollment.course._count.lessons,
        },
      };
    });

    return NextResponse.json({ success: true, data: formattedEnrollments });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error fetching enrollments:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch enrollments" },
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
    const { courseId } = body;
    // You enrol yourself. The id used to come from the body, so any caller
    // could enrol anyone in anything.
    const userId = actingUserId;

    if (!courseId) {
      return NextResponse.json({ success: false, error: "courseId is required" }, { status: 400 });
    }

    // Check if course exists
    const course = await db.course.findUnique({
      where: { id: courseId },
      select: { id: true, status: true, creatorId: true },
    });
    if (!course || course.status !== "published") {
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
    }
    if (course.creatorId === userId) {
      return NextResponse.json(
        { success: false, error: "You cannot enroll in your own course" },
        { status: 403 },
      );
    }

    // Check if already enrolled
    const existing = await db.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
    });

    if (existing && existing.status !== "dropped") {
      return NextResponse.json(
        { success: false, error: "Already enrolled in this course" },
        { status: 409 },
      );
    }

    // The row and its denormalised counter are one change: a failure cannot
    // leave the count ahead of the actual enrolments.
    const enrollment = await db.$transaction(async (tx) => {
      const created = existing
        ? await tx.enrollment.update({
            where: { id: existing.id },
            data: { status: "in_progress", enrolledAt: new Date(), completedAt: null },
            include: {
              course: {
                include: { category: true, _count: { select: { lessons: true } } },
              },
            },
          })
        : await tx.enrollment.create({
            data: { userId, courseId, status: "in_progress" },
            include: {
              course: {
                include: { category: true, _count: { select: { lessons: true } } },
              },
            },
          });
      const studentCount = await tx.enrollment.count({
        where: { courseId, status: { not: "dropped" } },
      });
      await tx.course.update({
        where: { id: courseId },
        data: { studentCount },
      });
      return created;
    });

    return NextResponse.json({ success: true, data: enrollment }, { status: 201 });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error creating enrollment:", error);
    return NextResponse.json(
      { success: false, error: "Failed to enroll in course" },
      { status: 500 },
    );
  }
}
