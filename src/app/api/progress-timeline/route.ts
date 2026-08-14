import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SectionTimelineData {
  sectionId: string;
  sectionTitle: string;
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
    totalSections: number;
    completedSections: number;
  } & {
    sections: SectionTimelineData[];
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
/*  GET /api/progress-timeline?userId=xxx&courseId=xxx                  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "user_student_001";
    const courseId = searchParams.get("courseId");

    if (!courseId) {
      return NextResponse.json(
        { success: false, error: "courseId is required" },
        { status: 400 }
      );
    }

    // Fetch enrollment with progress data
    const enrollment = await db.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
      include: {
        course: {
          include: {
            sections: {
              orderBy: { order: "asc" },
            },
          },
        },
        progresses: {
          include: {
            section: true,
          },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!enrollment) {
      return NextResponse.json(
        { success: false, error: "Not enrolled in this course" },
        { status: 404 }
      );
    }

    const sections = enrollment.course.sections;
    const progresses = enrollment.progresses;

    // Build section timeline data
    const sectionMap = new Map(
      progresses.map((p) => [p.sectionId, p])
    );

    const sectionTimeline: SectionTimelineData[] = sections.map((sec) => {
      const prog = sectionMap.get(sec.id);
      let status: "not-started" | "in-progress" | "completed" = "not-started";
      let currentPage = 0;
      let lastAccessedAt: string | null = null;
      let lastAccessedDaysAgo: number | null = null;

      if (prog) {
        currentPage = prog.currentPage;
        lastAccessedAt = prog.lastAccessedAt?.toISOString() || prog.updatedAt.toISOString();
        lastAccessedDaysAgo = daysBetween(
          new Date(lastAccessedAt),
          new Date()
        );
        if (prog.completed) {
          status = "completed";
        } else if (prog.currentPage > 0) {
          status = "in-progress";
        }
      }

      const totalPages = sec.totalPages || 0;
      const progressPct =
        totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
      // Estimate ~2 min per page
      const timeEstimateMinutes = Math.max(2, totalPages * 2);

      return {
        sectionId: sec.id,
        sectionTitle: sec.title,
        order: sec.order,
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
    const totalSections = sections.length;
    const completedSections = sectionTimeline.filter(
      (s) => s.status === "completed"
    ).length;
    const overallProgress =
      totalSections > 0
        ? Math.round((completedSections / totalSections) * 100)
        : 0;

    // Total time estimate
    const totalTimeEstimateMinutes = sectionTimeline.reduce(
      (sum, s) => sum + s.timeEstimateMinutes,
      0
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

    // First section completed
    const completedProgresses = progresses
      .filter((p) => p.completed)
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

    if (completedProgresses.length > 0) {
      milestones.push({
        type: "first-completed",
        label: "First Section Completed",
        date: formatDate(completedProgresses[0].updatedAt),
        icon: "check",
      });
    }

    // Halfway: when completedSections >= totalSections / 2
    if (totalSections > 0 && completedSections >= Math.ceil(totalSections / 2)) {
      // Find the progress that made it halfway
      const halfwayIndex = Math.ceil(totalSections / 2) - 1;
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
        totalSections,
        completedSections,
        sections: sectionTimeline,
        milestones,
        totalTimeEstimateMinutes,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Progress Timeline API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load progress timeline" },
      { status: 500 }
    );
  }
}
