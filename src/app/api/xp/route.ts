import { NextResponse } from "next/server";
import { authFailure } from "@/lib/api-response";
import { requireUser, AuthorizationError } from "@/lib/session";

// ------------------------------------------------------------------
//  Types
// ------------------------------------------------------------------

interface XpHistoryEntry {
  date: string;
  xp: number;
  reason: string;
  type: string;
}

interface XpResponse {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpHistory: XpHistoryEntry[];
  levelTitle: string;
  progressPercent: number;
}

// ------------------------------------------------------------------
//  Level titles
// ------------------------------------------------------------------

const LEVEL_TITLES: Record<number, string> = {
  1: "Beginner",
  2: "Learner",
  3: "Scholar",
  4: "Adept",
  5: "Expert",
  6: "Master",
  7: "Sage",
  8: "Grandmaster",
  9: "Legend",
  10: "Champion",
};

// ------------------------------------------------------------------
//  XP formula: xpForLevel(n) = Math.floor(50 * n * (n + 1) / 2)
//  Level 1 = 0 XP, Level 2 = 100 XP, Level 3 = 250 XP, etc.
// ------------------------------------------------------------------

function xpForLevel(level: number): number {
  // For level 1: 50 * 0 * 1 / 2 = 0
  // For level 2: 50 * 1 * 2 / 2 = 50... but spec says 100.
  // Using the formula from spec directly for the threshold table:
  const thresholds = [0, 100, 250, 500, 1000, 1750, 2750, 4000, 5500, 7500];
  const idx = Math.max(0, Math.min(level - 1, thresholds.length - 1));
  return thresholds[idx];
}

function getLevelFromXp(totalXp: number): number {
  const thresholds = [0, 100, 250, 500, 1000, 1750, 2750, 4000, 5500, 7500];
  let level = 1;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (totalXp >= thresholds[i]) {
      level = i + 1;
      break;
    }
  }
  return Math.min(level, 10);
}

// ------------------------------------------------------------------
//  Seeded random for consistent mock data
// ------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

function hashUserId(userId: string): number {
  return userId.split("").reduce((a, c) => {
    return ((a << 5) - a + c.charCodeAt(0)) | 0;
  }, 0);
}

// ------------------------------------------------------------------
//  Generate mock XP history
// ------------------------------------------------------------------

function generateMockHistory(userId: string): XpHistoryEntry[] {
  const rand = seededRandom(Math.abs(hashUserId(userId)) + 42);
  const reasons = [
    { reason: "Completed lesson: Intro to React", type: "lesson" },
    { reason: "Quiz score: 80% on TypeScript Basics", type: "quiz" },
    { reason: "Studied for 20 minutes", type: "study" },
    { reason: "Posted a course comment", type: "comment" },
    { reason: "Rated course: Advanced CSS", type: "rating" },
    { reason: "Completed lesson: State Management", type: "lesson" },
    { reason: "Daily login streak bonus", type: "streak" },
    { reason: "Completed lesson: API Design", type: "lesson" },
    { reason: "Quiz score: 100% on Python Basics", type: "quiz" },
    { reason: "Bookmarked 3 courses", type: "bookmark" },
  ];

  const history: XpHistoryEntry[] = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const entry = reasons[Math.floor(rand() * reasons.length)];
    const xp = Math.floor(rand() * 60) + 15; // 15-75 XP per entry

    history.push({
      date: dateStr,
      xp,
      reason: entry.reason,
      type: entry.type,
    });
  }

  return history;
}

// ------------------------------------------------------------------
//  GET /api/xp?userId=xxx
// ------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    // Whose data this is comes from the session, never from the query string:
    // the id used to default to a seeded account, so every signed-in user saw
    // that account's numbers, and anyone could read another user's by asking.
    const userId = (await requireUser()).id;

    // Generate mock total XP in 150-600 range, seeded by userId
    const rand = seededRandom(Math.abs(hashUserId(userId)));
    const totalXp = Math.floor(rand() * 451) + 150; // 150-600

    const level = getLevelFromXp(totalXp);
    const currentLevelXp = xpForLevel(level);
    const nextLevelXp = level < 10 ? xpForLevel(level + 1) : currentLevelXp;
    const xpInCurrentLevel = totalXp - currentLevelXp;
    const xpNeededForNext = nextLevelXp - currentLevelXp;
    const progressPercent =
      level >= 10 ? 100 : Math.min(100, Math.round((xpInCurrentLevel / xpNeededForNext) * 100));

    const xpHistory = generateMockHistory(userId);

    return NextResponse.json({
      success: true,
      data: {
        totalXp,
        level,
        currentLevelXp,
        nextLevelXp,
        xpHistory,
        levelTitle: LEVEL_TITLES[level] || "Beginner",
        progressPercent,
      } satisfies XpResponse,
    });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error fetching XP:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch XP data" }, { status: 500 });
  }
}

// ------------------------------------------------------------------
//  POST /api/xp — Add XP (demo, returns success with updated total)
// ------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    // The acting user is the signed-in one. Taking it from the request let a
    // caller create or change rows belonging to anybody.
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
    const { xp, reason, type } = body as {
      xp?: number;
      reason?: string;
      type?: string;
    };

    const userId = actingUserId;

    if (!xp || xp <= 0) {
      return NextResponse.json(
        { success: false, error: "A positive xp amount is required" },
        { status: 400 },
      );
    }

    // In a real app, this would persist to the database.
    // For demo, we just return success with the "updated" total.
    const rand = seededRandom(Math.abs(hashUserId(userId)));
    const baseXp = Math.floor(rand() * 451) + 150;
    const newTotal = baseXp + xp;
    const level = getLevelFromXp(newTotal);
    const currentLevelXp = xpForLevel(level);
    const nextLevelXp = level < 10 ? xpForLevel(level + 1) : currentLevelXp;
    const xpInCurrentLevel = newTotal - currentLevelXp;
    const xpNeededForNext = nextLevelXp - currentLevelXp;
    const progressPercent =
      level >= 10 ? 100 : Math.min(100, Math.round((xpInCurrentLevel / xpNeededForNext) * 100));

    return NextResponse.json({
      success: true,
      data: {
        totalXp: newTotal,
        level,
        currentLevelXp,
        nextLevelXp,
        levelTitle: LEVEL_TITLES[level] || "Beginner",
        progressPercent,
        addedXp: xp,
        reason: reason || "XP earned",
        type: type || "other",
      },
    });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error adding XP:", error);
    return NextResponse.json({ success: false, error: "Failed to add XP" }, { status: 500 });
  }
}
