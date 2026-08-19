import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface SocialActivityItem {
  id: string;
  userName: string;
  userAvatar: string;
  userRole: string;
  action:
    | "completed_lesson"
    | "enrolled_course"
    | "posted_comment"
    | "earned_badge"
    | "rated_course"
    | "started_streak";
  targetTitle: string;
  targetType: string;
  timestamp: string;
  xpEarned: number | null;
}

// ─────────────────────────────────────────────────────
// Seeded pseudo-random number generator (mulberry32)
// ─────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(rng: () => number, arr: T[], n: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, n);
}

// ─────────────────────────────────────────────────────
// Data pools
// ─────────────────────────────────────────────────────

const NAMES = [
  "Sarah Chen",
  "Marcus Johnson",
  "Priya Patel",
  "James O'Brien",
  "Yuki Tanaka",
  "Elena Rodriguez",
  "David Kim",
  "Amara Okafor",
  "Lucas Weber",
  "Fatima Al-Rashid",
  "Ryan Mitchell",
  "Sophie Larsson",
  "Kwame Asante",
  "Isabella Rossi",
  "Noah Williams",
];

const ROLES = [
  "Engineer",
  "Designer",
  "Product Manager",
  "Data Analyst",
  "Marketing Lead",
  "DevOps",
  "QA Engineer",
  "Team Lead",
];

const COURSE_TITLES = [
  "React Performance Patterns",
  "System Design Fundamentals",
  "TypeScript Advanced Types",
  "Design Systems at Scale",
  "Data Visualization with D3",
  "Microservices Architecture",
  "Kubernetes in Production",
  "Machine Learning Basics",
  "Advanced CSS Layouts",
  "Node.js Best Practices",
  "GraphQL API Design",
  "CI/CD Pipeline Mastery",
  "Cloud Security Essentials",
  "Python for Data Science",
];

const LESSON_TITLES = [
  "Introduction & Setup",
  "Core Concepts",
  "Advanced Patterns",
  "Real-World Examples",
  "Performance Optimization",
  "Testing Strategies",
  "Deployment Guide",
  "Security Best Practices",
];

const BADGE_NAMES = [
  "Quick Learner",
  "Knowledge Seeker",
  "Consistent Scholar",
  "Course Pioneer",
  "Streak Master",
  "Top Contributor",
  "Completion Champion",
];

const ACTION_TYPES: SocialActivityItem["action"][] = [
  "completed_lesson",
  "enrolled_course",
  "posted_comment",
  "earned_badge",
  "rated_course",
  "started_streak",
];

const RELATIVE_TIMESTAMPS = [
  "Just now",
  "2m ago",
  "5m ago",
  "8m ago",
  "12m ago",
  "18m ago",
  "25m ago",
  "32m ago",
  "45m ago",
  "1h ago",
  "1h 15m ago",
];

const XP_MAP: Record<SocialActivityItem["action"], () => number | null> = {
  completed_lesson: () => 25,
  enrolled_course: () => 10,
  posted_comment: () => 5,
  earned_badge: () => 50,
  rated_course: () => 3,
  started_streak: () => null,
};

// ─────────────────────────────────────────────────────
// Generate activity data
// ─────────────────────────────────────────────────────

function generateSocialFeed(seed: number, limit: number): SocialActivityItem[] {
  const rng = mulberry32(seed);
  const usedNames = new Set<string>();
  const activities: SocialActivityItem[] = [];

  const selectedNames = pickN(rng, NAMES, Math.min(limit, NAMES.length));

  for (let i = 0; i < limit; i++) {
    const name = selectedNames[i % selectedNames.length];
    const action = ACTION_TYPES[Math.floor(rng() * ACTION_TYPES.length)];

    let targetTitle: string;
    let targetType: string;

    switch (action) {
      case "completed_lesson": {
        targetTitle = pick(rng, LESSON_TITLES);
        targetType = "lesson";
        break;
      }
      case "enrolled_course": {
        targetTitle = pick(rng, COURSE_TITLES);
        targetType = "course";
        break;
      }
      case "posted_comment": {
        targetTitle = pick(rng, COURSE_TITLES);
        targetType = "course";
        break;
      }
      case "earned_badge": {
        targetTitle = pick(rng, BADGE_NAMES);
        targetType = "badge";
        break;
      }
      case "rated_course": {
        targetTitle = pick(rng, COURSE_TITLES);
        targetType = "course";
        break;
      }
      case "started_streak": {
        targetTitle = "3-day learning streak";
        targetType = "streak";
        break;
      }
    }

    // Generate initials
    const nameParts = name.trim().split(/\s+/);
    const initials =
      nameParts.length >= 2
        ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
        : nameParts[0].slice(0, 2).toUpperCase();

    usedNames.add(name);

    activities.push({
      id: `activity_${String(i + 1).padStart(3, "0")}`,
      userName: name,
      userAvatar: initials,
      userRole: pick(rng, ROLES),
      action,
      targetTitle,
      targetType,
      timestamp: RELATIVE_TIMESTAMPS[Math.min(i, RELATIVE_TIMESTAMPS.length - 1)],
      xpEarned: XP_MAP[action](),
    });
  }

  return activities;
}

// ─────────────────────────────────────────────────────
// GET handler
// ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const userId = searchParams.get("userId") || "user_student_001";
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(parseInt(limitParam || "10", 10), 1), 20);

  // Use userId as part of seed for slight personalization, but keep it deterministic
  const seed = 42;
  const activities = generateSocialFeed(seed, limit);

  return NextResponse.json({
    success: true,
    data: activities,
    meta: {
      total: activities.length,
      userId,
    },
  });
}
