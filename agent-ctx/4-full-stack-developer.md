# Task 4 — full-stack-developer

## Task
Add leaderboard/rankings feature to Profile page.

## Files Created
- `/src/app/api/leaderboard/route.ts` — GET endpoint returning 10 ranked users (1 real + 9 mock)

## Files Modified
- `/src/components/lms/pages/profile-page.tsx` — Added `TeamLeaderboardCard`, `RankBadge`, `LeaderboardSkeleton` components; placed leaderboard card below Quick Actions grid

## Key Decisions
- Mock data hardcoded in API route since only 1 seeded user exists
- Score formula: `completedCourses * 100 + avgProgress * 10`
- 9 mock users spanning 8 departments with varied scores (range: 245–1620)
- Current user row highlighted with primary background ring and cyan-teal gradient avatar
- Top 3 ranks get gold/silver/bronze gradient badges
- Full-width card below the 2-column grid, scrollable at max-h-[420px]

## Verification
- ESLint: 0 errors in modified/new files
- Dev server: Compiles successfully, no new warnings
