import { NextResponse } from "next/server";
import { authFailure } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// ------------------------------------------------------------------
//  Types
// ------------------------------------------------------------------

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  department: string;
  completedCourses: number;
  avgProgress: number;
  score: number;
  isCurrentUser: boolean;
}

// ------------------------------------------------------------------
//  Mock users to populate the leaderboard
// ------------------------------------------------------------------

const MOCK_USERS = [
  {
    id: "mock_sarah_chen",
    name: "Sarah Chen",
    department: "Engineering",
    completedCourses: 7,
    avgProgress: 92,
  },
  {
    id: "mock_james_wilson",
    name: "James Wilson",
    department: "Product",
    completedCourses: 6,
    avgProgress: 85,
  },
  {
    id: "mock_emily_rodriguez",
    name: "Emily Rodriguez",
    department: "Design",
    completedCourses: 5,
    avgProgress: 78,
  },
  {
    id: "mock_michael_kim",
    name: "Michael Kim",
    department: "Marketing",
    completedCourses: 5,
    avgProgress: 70,
  },
  {
    id: "mock_anna_petrov",
    name: "Anna Petrov",
    department: "HR",
    completedCourses: 4,
    avgProgress: 88,
  },
  {
    id: "mock_david_okonkwo",
    name: "David Okonkwo",
    department: "Sales",
    completedCourses: 3,
    avgProgress: 95,
  },
  {
    id: "mock_lisa_nakamura",
    name: "Lisa Nakamura",
    department: "Finance",
    completedCourses: 3,
    avgProgress: 60,
  },
  {
    id: "mock_ryan_murphy",
    name: "Ryan Murphy",
    department: "Operations",
    completedCourses: 2,
    avgProgress: 75,
  },
  {
    id: "mock_chloe_dupont",
    name: "Chloe Dupont",
    department: "Engineering",
    completedCourses: 2,
    avgProgress: 45,
  },
];

// ------------------------------------------------------------------
//  Score calculation: completedCourses * 100 + avgProgress * 10
// ------------------------------------------------------------------

function calcScore(completedCourses: number, avgProgress: number): number {
  return completedCourses * 100 + avgProgress * 10;
}

// ------------------------------------------------------------------
//  GET /api/leaderboard
// ------------------------------------------------------------------

export async function GET() {
  try {
    // "You" on the board is the signed-in user; it used to be a hardcoded seed
    // account, so every viewer saw the same person highlighted as themselves.
    const currentUserId = (await requireUser()).id;
    // Fetch the real current user's stats from the database
    const user = await db.user.findUnique({
      where: { id: currentUserId },
      include: {
        enrollments: {
          include: {
            progresses: true,
            course: {
              include: {
                _count: { select: { lessons: true } },
              },
            },
          },
        },
      },
    });

    let currentUserEntry: LeaderboardEntry | null = null;

    if (user) {
      const completedCourses = user.enrollments.filter((e) => e.status === "completed").length;

      let totalProgress = 0;
      let enrollmentCount = 0;

      for (const enrollment of user.enrollments) {
        const totalLessons = enrollment.course._count.lessons;
        if (totalLessons > 0) {
          const completedLessons = enrollment.progresses.filter((p) => p.completed).length;
          totalProgress += (completedLessons / totalLessons) * 100;
          enrollmentCount++;
        }
      }

      const avgProgress = enrollmentCount > 0 ? Math.round(totalProgress / enrollmentCount) : 0;

      currentUserEntry = {
        rank: 0, // assigned after sorting
        id: user.id,
        name: user.name || user.email,
        department: user.department || "Engineering",
        completedCourses,
        avgProgress,
        score: calcScore(completedCourses, avgProgress),
        isCurrentUser: true,
      };
    }

    // Build mock entries
    const mockEntries: LeaderboardEntry[] = MOCK_USERS.map((m) => ({
      rank: 0,
      id: m.id,
      name: m.name,
      department: m.department,
      completedCourses: m.completedCourses,
      avgProgress: m.avgProgress,
      score: calcScore(m.completedCourses, m.avgProgress),
      isCurrentUser: false,
    }));

    // Combine, sort by score descending, assign ranks
    const allEntries = [...mockEntries];
    if (currentUserEntry) {
      allEntries.push(currentUserEntry);
    }

    allEntries.sort((a, b) => b.score - a.score);

    allEntries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return NextResponse.json({
      success: true,
      data: allEntries,
    });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error fetching leaderboard:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
}
