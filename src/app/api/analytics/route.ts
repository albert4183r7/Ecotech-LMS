import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StatsCard {
  totalEnrolled: number;
  hoursStudied: number;
  coursesCompleted: number;
  currentStreak: number;
}

interface CourseProgress {
  courseId: string;
  courseTitle: string;
  categoryName: string | null;
  categoryColor: string | null;
  progress: number;
  status: string;
}

interface CategoryDistribution {
  categoryName: string;
  categoryColor: string | null;
  courseCount: number;
}

interface RecentActivity {
  id: string;
  type: "enrollment" | "completion" | "rating" | "progress";
  description: string;
  timestamp: string;
  courseTitle: string;
}

interface TopCourse {
  courseId: string;
  courseTitle: string;
  rating: number;
  studentCount: number;
  categoryName: string | null;
  categoryColor: string | null;
}

interface AnalyticsResponse {
  success: boolean;
  data: {
    stats: StatsCard;
    courseProgress: CourseProgress[];
    categoryDistribution: CategoryDistribution[];
    recentActivity: RecentActivity[];
    topCourses: TopCourse[];
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Generate relative time description from a date */
function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
}

/* ------------------------------------------------------------------ */
/*  GET /api/analytics?userId=xxx                                       */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "user_demo_001";

    // Fetch all enrollments with related data
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            category: true,
            sections: true,
            _count: { select: { enrollments: true } },
          },
        },
        progresses: {
          include: {
            section: true,
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    // Fetch user's ratings
    const ratings = await db.rating.findMany({
      where: { userId },
      include: {
        course: {
          include: { category: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // ---- Compute Stats ----
    const totalEnrolled = enrollments.length;
    const coursesCompleted = enrollments.filter(
      (e) => e.status === "completed"
    ).length;

    // Estimate hours studied: each completed section ~ 30 min, each in-progress ~15 min
    let totalMinutes = 0;
    for (const enrollment of enrollments) {
      for (const progress of enrollment.progresses) {
        if (progress.completed) {
          totalMinutes += 30;
        } else if (progress.currentPage > 1) {
          totalMinutes += 15;
        }
      }
    }
    const hoursStudied = Math.round(totalMinutes / 60 * 10) / 10;

    // Get current streak from activity data
    let currentStreak = 0;
    try {
      const today = new Date();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);

      const recentProgress = await db.progress.findMany({
        where: {
          enrollment: { userId },
          updatedAt: { gte: cutoffDate },
        },
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
      });

      if (recentProgress.length > 0) {
        const activeDays = new Set<string>();
        for (const p of recentProgress) {
          activeDays.add(p.updatedAt.toISOString().split("T")[0]);
        }

        // Count consecutive days from today backwards
        let checkDate = new Date(today);
        checkDate.setHours(0, 0, 0, 0);

        while (true) {
          const dateStr = checkDate.toISOString().split("T")[0];
          if (activeDays.has(dateStr)) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
          } else {
            break;
          }
        }
      }
    } catch {
      currentStreak = 0;
    }

    const stats: StatsCard = {
      totalEnrolled,
      hoursStudied,
      coursesCompleted,
      currentStreak,
    };

    // ---- Compute Course Progress ----
    const courseProgress: CourseProgress[] = enrollments.map((e) => {
      const totalSections = e.course.sections.length;
      const completedSections = e.progresses.filter((p) => p.completed).length;
      const progress =
        totalSections > 0
          ? Math.round((completedSections / totalSections) * 100)
          : 0;

      return {
        courseId: e.course.id,
        courseTitle: e.course.title,
        categoryName: e.course.category?.name || null,
        categoryColor: e.course.category?.color || null,
        progress,
        status: e.status,
      };
    });

    // ---- Compute Category Distribution ----
    const categoryMap = new Map<string, { count: number; color: string | null }>();
    for (const e of enrollments) {
      const catName = e.course.category?.name || "Uncategorized";
      const catColor = e.course.category?.color || null;
      const existing = categoryMap.get(catName);
      if (existing) {
        existing.count++;
      } else {
        categoryMap.set(catName, { count: 1, color: catColor });
      }
    }

    const categoryDistribution: CategoryDistribution[] = Array.from(
      categoryMap.entries()
    )
      .map(([categoryName, { count, color }]) => ({
        categoryName,
        categoryColor: color,
        courseCount: count,
      }))
      .sort((a, b) => b.courseCount - a.courseCount);

    // ---- Generate Recent Activity ----
    const recentActivity: RecentActivity[] = [];

    // Add enrollment activities (most recent 3)
    for (const e of enrollments.slice(0, 3)) {
      recentActivity.push({
        id: `enroll-${e.id}`,
        type: "enrollment",
        description: "Enrolled in",
        timestamp: e.enrolledAt.toISOString(),
        courseTitle: e.course.title,
      });
    }

    // Add completion activities
    for (const e of enrollments.filter((e) => e.status === "completed")) {
      if (e.completedAt) {
        recentActivity.push({
          id: `complete-${e.id}`,
          type: "completion",
          description: "Completed",
          timestamp: e.completedAt.toISOString(),
          courseTitle: e.course.title,
        });
      }
    }

    // Add rating activities
    for (const r of ratings.slice(0, 2)) {
      recentActivity.push({
        id: `rating-${r.id}`,
        type: "rating",
        description: `Rated ${r.score} stars`,
        timestamp: r.createdAt.toISOString(),
        courseTitle: r.course.title,
      });
    }

    // Sort by timestamp descending, take top 7
    recentActivity.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const finalActivity = recentActivity.slice(0, 7).map((item) => ({
      ...item,
      timestamp: timeAgo(new Date(item.timestamp)),
    }));

    // ---- Compute Top Courses by Rating ----
    const allCourses = await db.course.findMany({
      where: { status: "published" },
      include: {
        category: true,
        _count: { select: { enrollments: true } },
      },
      orderBy: { rating: "desc" },
      take: 10,
    });

    const topCourses: TopCourse[] = allCourses.slice(0, 3).map((c) => ({
      courseId: c.id,
      courseTitle: c.title,
      rating: c.rating,
      studentCount: c._count.enrollments,
      categoryName: c.category?.name || null,
      categoryColor: c.category?.color || null,
    }));

    // ---- Build Response ----
    const response: AnalyticsResponse = {
      success: true,
      data: {
        stats,
        courseProgress,
        categoryDistribution,
        recentActivity: finalActivity,
        topCourses,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load analytics data" },
      { status: 500 }
    );
  }
}
