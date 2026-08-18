import { NextResponse } from 'next/server';

// ------------------------------------------------------------------
//  Types
// ------------------------------------------------------------------

interface Challenge {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  type: string;
  icon: string;
  completed: boolean;
  progressText: string;
}

// ------------------------------------------------------------------
//  Challenge pool (8 possible challenges)
// ------------------------------------------------------------------

const CHALLENGE_POOL: Array<{
  title: string;
  description: string;
  xpReward: number;
  type: string;
  icon: string;
  progressText: string;
}> = [
  {
    title: 'Complete a Lesson',
    description: 'Finish any course lesson to earn XP',
    xpReward: 25,
    type: 'complete_lesson',
    icon: 'BookOpenCheck',
    progressText: '0/1 lessons completed',
  },
  {
    title: 'Take a Quiz',
    description: 'Visit and attempt any quiz slide',
    xpReward: 30,
    type: 'take_quiz',
    icon: 'ClipboardCheck',
    progressText: '0/1 quizzes attempted',
  },
  {
    title: 'Study for 15 Minutes',
    description: 'Spend at least 15 minutes learning today',
    xpReward: 50,
    type: 'study_15min',
    icon: 'Timer',
    progressText: '0/15 minutes studied',
  },
  {
    title: 'Leave a Comment',
    description: 'Post a comment on any course discussion',
    xpReward: 20,
    type: 'leave_comment',
    icon: 'MessageSquarePlus',
    progressText: '0/1 comments posted',
  },
  {
    title: 'Rate a Course',
    description: 'Give a star rating to any enrolled course',
    xpReward: 15,
    type: 'rate_course',
    icon: 'Star',
    progressText: '0/1 courses rated',
  },
  {
    title: 'Bookmark a Course',
    description: 'Save a course to your bookmarks collection',
    xpReward: 10,
    type: 'bookmark_course',
    icon: 'Bookmark',
    progressText: '0/1 courses bookmarked',
  },
  {
    title: 'View Dashboard',
    description: 'Check your learning dashboard overview',
    xpReward: 10,
    type: 'view_dashboard',
    icon: 'LayoutDashboard',
    progressText: 'Not visited today',
  },
  {
    title: 'Read Notes',
    description: 'Review or create a study note',
    xpReward: 15,
    type: 'read_notes',
    icon: 'FileText',
    progressText: '0/1 notes reviewed',
  },
];

// ------------------------------------------------------------------
//  Seeded random number generator (simple LCG)
// ------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ------------------------------------------------------------------
//  Get today's date seed
// ------------------------------------------------------------------

function getDaySeed(): number {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

// ------------------------------------------------------------------
//  Mock activity check: deterministically mark some challenges
//  as completed based on userId + date seed
// ------------------------------------------------------------------

function isChallengeCompleted(userId: string, challengeType: string, seed: number): boolean {
  const hash = (userId + challengeType + seed.toString()).split('').reduce((a, c) => {
    return ((a << 5) - a + c.charCodeAt(0)) | 0;
  }, 0);
  return Math.abs(hash) % 5 === 0; // ~20% chance of being completed
}

// ------------------------------------------------------------------
//  Fisher-Yates shuffle with seeded random
// ------------------------------------------------------------------

function shuffleArray<T>(arr: T[], rand: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ------------------------------------------------------------------
//  GET /api/challenges?userId=xxx
// ------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || 'user_student_001';

    const seed = getDaySeed();
    const rand = seededRandom(seed);

    // Shuffle and pick 4 challenges
    const shuffled = shuffleArray(CHALLENGE_POOL, rand);
    const selected = shuffled.slice(0, 4);

    // Build challenge responses with completion status and progress text
    const challenges: Challenge[] = selected.map((c, index) => {
      const completed = isChallengeCompleted(userId, c.type, seed);
      return {
        id: `challenge_${seed}_${index}`,
        title: c.title,
        description: c.description,
        xpReward: c.xpReward,
        type: c.type,
        icon: c.icon,
        completed,
        progressText: completed
          ? c.type === 'study_15min'
            ? '15/15 minutes studied ✓'
            : c.type === 'complete_lesson'
              ? '1/1 sections completed ✓'
              : c.type === 'take_quiz'
                ? '1/1 quizzes attempted ✓'
                : c.type === 'leave_comment'
                  ? '1/1 comments posted ✓'
                  : c.type === 'rate_course'
                    ? '1/1 courses rated ✓'
                    : c.type === 'bookmark_course'
                      ? '1/1 courses bookmarked ✓'
                      : c.type === 'view_dashboard'
                        ? 'Visited today ✓'
                        : '1/1 notes reviewed ✓'
          : c.progressText,
      };
    });

    const completedCount = challenges.filter(c => c.completed).length;

    return NextResponse.json({
      success: true,
      data: {
        challenges,
        date: new Date().toISOString().split('T')[0],
        completedCount,
        totalCount: challenges.length,
        totalXpAvailable: challenges.reduce((sum, c) => sum + c.xpReward, 0),
        totalXpEarned: challenges.filter(c => c.completed).reduce((sum, c) => sum + c.xpReward, 0),
      },
    });
  } catch (error) {
    console.error('Error fetching challenges:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch challenges' },
      { status: 500 }
    );
  }
}
