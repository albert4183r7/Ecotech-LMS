import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LessonTimelineData {
  lessonId: string;
  lessonTitle: string;
  order: number;
  status: "not-started" | "in-progress" | "completed";
  currentPage: number;
  totalPages: number;
  progressPct: number;
  lastAccessedAt: string | null;
  lastAccessedDaysAgo: number | null;
  timeEstimateMinutes: number;
}

interface Milestone {
  type: "first-access" | "first-completed" | "halfway" | "course-completed";
  label: string;
  date: string | null;
  icon: string;
}

interface ProgressTimelineResponse {
  success: boolean;
  data: {
    courseId: string;
    courseTitle: string;
    userId: string;
    overallProgress: number;
    totalLessons: number;
    completedLessons: number;
  } & {
    lessons: LessonTimelineData[];
    milestones: Milestone[];
    totalTimeEstimateMinutes: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function daysBetween(date1: Date, date2: Date): number {
  const msPerDay = 86400000;
  return Math.floor(Math.abs(date2.getTime() - date1.getTime()) / msPerDay);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  GET /api/progress/timeline?userId=xxx&courseId=xxx                  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "user_student_001";
    const courseId = searchParams.get("courseId");

    if (!courseId) {
      return NextResponse.json({ success: false, error: "courseId is required" }, { status: 400 });
    }

    // Fetch enrollment with progress data
    const enrollment = await db.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
      include: {
        course: {
          include: {
            lessons: {
              orderBy: { order: "asc" },
            },
          },
        },
        progresses: {
          include: {
            lesson: true,
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!enrollment) {
      return NextResponse.json(
        { success: false, error: "Not enrolled in this course" },
        { status: 404 },
      );
    }

    const lessons = enrollment.course.lessons;
    const progresses = enrollment.progresses;

    // Build lesson timeline data
    const lessonMap = new Map(progresses.map((p) => [p.lessonId, p]));

    const lessonTimeline: LessonTimelineData[] = lessons.map((lesson) => {
      const prog = lessonMap.get(lesson.id);
      let status: "not-started" | "in-progress" | "completed" = "not-started";
      let currentPage = 0;
      let lastAccessedAt: string | null = null;
      let lastAccessedDaysAgo: number | null = null;

      if (prog) {
        currentPage = prog.currentPage;
        lastAccessedAt = prog.lastAccessedAt?.toISOString() || prog.updatedAt.toISOString();
        lastAccessedDaysAgo = daysBetween(new Date(lastAccessedAt), new Date());
        if (prog.completed) {
          status = "completed";
        } else if (prog.currentPage > 0) {
          status = "in-progress";
        }
      }

      const totalPages = 1; // TODO: derive from slide count later
      const progressPct = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
      // Estimate ~2 min per page
      const timeEstimateMinutes = Math.max(2, totalPages * 2);

      return {
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        order: lesson.order,
        status,
        currentPage,
        totalPages,
        progressPct,
        lastAccessedAt,
        lastAccessedDaysAgo,
        timeEstimateMinutes,
      };
    });

    // Compute overall progress
    const totalLessons = lessons.length;
    const completedLessons = lessonTimeline.filter((l) => l.status === "completed").length;
    const overallProgress =
      totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

    // Total time estimate
    const totalTimeEstimateMinutes = lessonTimeline.reduce(
      (sum, l) => sum + l.timeEstimateMinutes,
      0,
    );

    // Build milestones
    const milestones: Milestone[] = [];

    // First access: earliest lastAccessedAt from progresses
    const allAccessDates = progresses
      .filter((p) => p.lastAccessedAt || p.updatedAt)
      .map((p) => p.lastAccessedAt || p.updatedAt)
      .sort((a, b) => a.getTime() - b.getTime());

    if (allAccessDates.length > 0) {
      milestones.push({
        type: "first-access",
        label: "Started Learning",
        date: formatDate(allAccessDates[0]),
        icon: "play",
      });
    }

    // First lesson completed
    const completedProgresses = progresses
      .filter((p) => p.completed)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

    if (completedProgresses.length > 0) {
      milestones.push({
        type: "first-completed",
        label: "First Lesson Completed",
        date: formatDate(completedProgresses[0].updatedAt),
        icon: "check",
      });
    }

    // Halfway: when completedLessons >= totalLessons / 2
    if (totalLessons > 0 && completedLessons >= Math.ceil(totalLessons / 2)) {
      // Find the progress that made it halfway
      const halfwayIndex = Math.ceil(totalLessons / 2) - 1;
      const halfwayProgress = completedProgresses[halfwayIndex];
      milestones.push({
        type: "halfway",
        label: "Halfway There!",
        date: halfwayProgress
          ? formatDate(halfwayProgress.updatedAt)
          : formatDate(enrollment.updatedAt),
        icon: "flag",
      });
    }

    // Course completed
    if (enrollment.status === "completed" && enrollment.completedAt) {
      milestones.push({
        type: "course-completed",
        label: "Course Completed!",
        date: formatDate(enrollment.completedAt),
        icon: "trophy",
      });
    }

    const response: ProgressTimelineResponse = {
      success: true,
      data: {
        courseId: enrollment.course.id,
        courseTitle: enrollment.course.title,
        userId,
        overallProgress,
        totalLessons,
        completedLessons,
        lessons: lessonTimeline,
        milestones,
        totalTimeEstimateMinutes,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Progress Timeline API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load progress timeline" },
      { status: 500 },
    );
  }
}
