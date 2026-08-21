import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// ------------------------------------------------------------------
//  Types
// ------------------------------------------------------------------

interface AchievementResult {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
}

// ------------------------------------------------------------------
//  GET /api/achievements?userId=xxx
// ------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    // Whose achievements these are comes from the session, never from the
    // query string: the id used to default to a seeded account, so every
    // signed-in user saw that account's badges.
    const userId = (await requireUser()).id;

    // Fetch user's enrollments with course category and progress data
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            category: { select: { id: true } },
            _count: { select: { lessons: true } },
          },
        },
        progresses: { select: { completed: true } },
      },
    });

    const totalEnrollments = enrollments.length;
    const completedCount = enrollments.filter((e) => e.status === "completed").length;

    // Check for 100% progress on any course (Perfectionist)
    let hasPerfectCourse = false;
    for (const enrollment of enrollments) {
      const totalLessons = enrollment.course._count.lessons;
      if (totalLessons > 0) {
        const completedLessons = enrollment.progresses.filter((p) => p.completed).length;
        if (completedLessons === totalLessons && completedLessons > 0) {
          hasPerfectCourse = true;
          break;
        }
      }
    }

    // Check for 3+ different categories (Explorer)
    const categoryIds = new Set<string>();
    for (const enrollment of enrollments) {
      if (enrollment.course.category?.id) {
        categoryIds.add(enrollment.course.category.id);
      }
    }
    const uniqueCategories = categoryIds.size;

    // Build achievements list
    const achievements: AchievementResult[] = [
      {
        id: "first-step",
        name: "First Step",
        description: "Enrolled in your first course",
        icon: "Zap",
        earned: totalEnrollments > 0,
      },
      {
        id: "quick-learner",
        name: "Quick Learner",
        description: "Completed your first course",
        icon: "Star",
        earned: completedCount > 0,
      },
      {
        id: "dedicated",
        name: "Dedicated",
        description: "Completed 3 or more courses",
        icon: "BookOpen",
        earned: completedCount >= 3,
      },
      {
        id: "scholar",
        name: "Scholar",
        description: "Completed 5 or more courses",
        icon: "Award",
        earned: completedCount >= 5,
      },
      {
        id: "perfectionist",
        name: "Perfectionist",
        description: "Achieved 100% progress on any course",
        icon: "Target",
        earned: hasPerfectCourse,
      },
      {
        id: "explorer",
        name: "Explorer",
        description: "Enrolled in courses from 3+ categories",
        icon: "Compass",
        earned: uniqueCategories >= 3,
      },
      {
        id: "streak-keeper",
        name: "Streak Keeper",
        description: "Maintained weekly learning activity",
        icon: "Flame",
        earned: false, // Mock — requires activity tracking system
      },
    ];

    return NextResponse.json({
      success: true,
      data: achievements,
    });
  } catch (error) {
    console.error("Error fetching achievements:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch achievements" },
      { status: 500 },
    );
  }
}
