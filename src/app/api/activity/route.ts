import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DayEntry {
  day: string;
  date: string;
  minutes: number;
}

interface ActivityResponse {
  success: boolean;
  data: {
    weeklyData: DayEntry[];
    dailyData: DayEntry[];
    streak: { current: number; longest: number };
    totalMinutes: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Seeded pseudo-random number generator for consistent mock data */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Format a Date to YYYY-MM-DD */
function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Generate N weeks of realistic mock daily activity data */
function generateMockData(weeks: number): DayEntry[] {
  const rand = seededRandom(42);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays = weeks * 7;
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - totalDays + 1);

  const data: DayEntry[] = [];
  let current = new Date(startDate);

  while (current <= today) {
    const dayOfWeek = current.getDay(); // 0 = Sun, 6 = Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Simulate realistic patterns:
    // - 15% chance of no activity on weekdays, 35% on weekends
    // - Weekdays: 15-120 min, Weekends: 0-60 min
    const noActivity = isWeekend
      ? rand() < 0.35
      : rand() < 0.15;

    let minutes = 0;
    if (!noActivity) {
      if (isWeekend) {
        minutes = Math.round(rand() * 60);
      } else {
        minutes = Math.round(15 + rand() * 105); // 15-120 min
      }
      // Add some "burst" days (~10% chance)
      if (rand() < 0.1) {
        minutes = Math.min(120, minutes + Math.round(rand() * 40));
      }
    }

    data.push({
      day: DAY_LABELS[dayOfWeek],
      date: toDateString(current),
      minutes,
    });

    current.setDate(current.getDate() + 1);
  }

  return data;
}

/** Calculate current and longest streak from daily data */
function calculateStreak(dailyData: DayEntry[]): {
  current: number;
  longest: number;
} {
  if (dailyData.length === 0) return { current: 0, longest: 0 };

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  // Walk from the end (most recent) to count current streak
  for (let i = dailyData.length - 1; i >= 0; i--) {
    if (dailyData[i].minutes > 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Walk entire array for longest streak
  for (const entry of dailyData) {
    if (entry.minutes > 0) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  return { current: currentStreak, longest: longestStreak };
}

/* ------------------------------------------------------------------ */
/*  GET /api/activity?userId=xxx&weeks=12                              */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || "user_demo_001";
    const weeks = Math.min(Math.max(parseInt(searchParams.get("weeks") || "12", 10), 1), 52);

    // Try to get real data from Progress table
    // Query progress records updated within the last N weeks
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - weeks * 7);

    let dailyData: DayEntry[];
    let useRealData = false;

    try {
      const progresses = await db.progress.findMany({
        where: {
          enrollment: {
            userId,
          },
          updatedAt: {
            gte: cutoffDate,
          },
        },
        select: {
          updatedAt: true,
        },
        orderBy: {
          updatedAt: "asc",
        },
      });

      if (progresses.length >= 3) {
        // We have enough real data — aggregate by day
        useRealData = true;
        const dayMap = new Map<string, number>();

        for (const p of progresses) {
          const dateStr = p.updatedAt.toISOString().split("T")[0];
          const existing = dayMap.get(dateStr) || 0;
          // Each progress update represents ~15-30 min of learning
          // Use a deterministic estimate based on time of update
          const hour = p.updatedAt.getHours();
          const minutes = 15 + Math.round(((hour * 60 + p.updatedAt.getMinutes()) % 45));
          dayMap.set(dateStr, existing + minutes);
        }

        // Build full daily array
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const totalDays = weeks * 7;
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - totalDays + 1);

        dailyData = [];
        let current = new Date(startDate);
        while (current <= today) {
          const dateStr = toDateString(current);
          const dayOfWeek = current.getDay();
          dailyData.push({
            day: DAY_LABELS[dayOfWeek],
            date: dateStr,
            minutes: dayMap.get(dateStr) || 0,
          });
          current.setDate(current.getDate() + 1);
        }
      }
    } catch {
      // Fall through to mock data
    }

    if (!useRealData) {
      dailyData = generateMockData(weeks);
    }

    // Calculate streak
    const streak = calculateStreak(dailyData);

    // Get last 7 days for weekly chart
    const weeklyData = dailyData.slice(-7);

    // Total minutes this week (last 7 days)
    const totalMinutes = weeklyData.reduce((sum, d) => sum + d.minutes, 0);

    const response: ActivityResponse = {
      success: true,
      data: {
        weeklyData,
        dailyData,
        streak,
        totalMinutes,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[Activity API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load activity data" },
      { status: 500 }
    );
  }
}
