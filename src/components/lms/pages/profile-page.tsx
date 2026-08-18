"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  BookOpen,
  CheckCircle,
  Clock,
  LogOut,
  Plus,
  GraduationCap,
  Shield,
  Building2,
  ArrowRight,
  LayoutGrid,
  Trophy,
  Medal,
  FileBadge,
  Flame,
  TrendingUp,
  TrendingDown,
  Lock,
  Award,
  Star,
  Zap,
  MessageSquare,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import { AchievementBadges } from "@/components/lms/achievement-badges";
import { ActivityChart } from "@/components/lms/activity-chart";
import { CertificateModal } from "@/components/lms/certificate-modal";
import { SkeletonList } from "@/components/lms/skeleton-cards";
import { CourseBookmarks } from "@/components/lms/course-bookmarks";
import { XpBarFull } from "@/components/lms/xp-bar";

/* ------------------------------------------------------------------ */
/*  Local types                                                       */
/* ------------------------------------------------------------------ */

interface UserStats {
  totalCourses: number;
  inProgress: number;
  completed: number;
  avgProgress: number;
  favoritesCount: number;
}

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: string;
  department: string | null;
  createdAt: string;
  stats: UserStats;
}

/* ------------------------------------------------------------------ */
/*  Circular Progress Ring                                             */
/* ------------------------------------------------------------------ */

function CircularProgress({ percentage }: { percentage: number }) {
  const radius = 70;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset =
    circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={radius * 2}
        height={radius * 2}
        className="-rotate-90"
      >
        {/* Background track */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/30"
        />
        {/* Progress arc with gradient stroke */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke="url(#progress-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient
            id="progress-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold tracking-tight text-foreground">
          {percentage}%
        </span>
        <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">
          completed
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated Counter Hook                                              */
/* ------------------------------------------------------------------ */

function useAnimatedCounter(target: number, duration = 800) {
  const [count, setCount] = useState(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) return;
    let start = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(eased * target);
      setCount(start);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return count;
}

/* ------------------------------------------------------------------ */
/*  Enhanced Stat Card with glass-morphism                              */
/* ------------------------------------------------------------------ */

function EnhancedStatCard({
  icon: Icon,
  label,
  value,
  color,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  trend?: { value: number; direction: 'up' | 'down' };
}) {
  const animatedValue = useAnimatedCounter(value);
  const TrendIcon = trend?.direction === 'up' ? TrendingUp : TrendingDown;

  return (
    <div className="glass-card group flex flex-col items-center gap-2 rounded-xl px-4 py-4 transition-all duration-200 hover:shadow-lg">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${color} shadow-md transition-transform duration-200 group-hover:scale-110`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <span className="count-up text-2xl font-extrabold leading-none text-foreground">
        {animatedValue}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">
        {label}
      </span>
      {trend && (
        <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${trend.direction === 'up' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
          <TrendIcon className="h-3 w-3" />
          {trend.value}%
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  XP Display Panel                                                   */
/* ------------------------------------------------------------------ */

function XPDisplay({ totalXP, level, progressToNext }: { totalXP: number; level: number; progressToNext: number }) {
  const animatedXP = useAnimatedCounter(totalXP, 1200);
  const nextLevelXP = level * 500;

  return (
    <Card className="border-border/50 overflow-hidden">
      <div className="relative bg-gradient-to-r from-blue-600/5 via-cyan-600/5 to-teal-500/5 px-6 py-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-gradient-to-r from-cyan-600 to-teal-500 text-xs font-bold text-white shadow-md">
              LVL {level}
            </Badge>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="count-up gradient-text text-5xl font-extrabold tracking-tight">
              {animatedXP}
            </span>
            <span className="gradient-text text-lg font-bold">XP</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {nextLevelXP - (totalXP % 500)} XP to Level {level + 1}
          </p>
        </div>
      </div>
      <CardContent className="pt-4 pb-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">Level {level}</span>
            <span className="font-medium text-muted-foreground">Level {level + 1}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${progressToNext}%`,
                background: 'linear-gradient(90deg, #06b6d4, #0891b2, #0d9488, #10b981)',
              }}
            />
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            {totalXP % 500} / 500 XP
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Streak Calendar (30-day grid)                                      */
/* ------------------------------------------------------------------ */

function StreakCalendar({ streak, bestStreak, userId }: { streak: number; bestStreak: number; userId: string }) {
  const [activityMap, setActivityMap] = useState<Map<string, number>>(new Map());
  const [days, setDays] = useState<Array<{ date: string; day: string; isToday: boolean }>>([]);
  const [maxMinutes, setMaxMinutes] = useState(1);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch(`/api/activity?userId=${userId}&weeks=5`);
        const json = await res.json();
        if (json.success) {
          // Build 30-day grid from the response
          const allDays: ActivityDayEntry[] = [];
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const start = new Date(today);
          start.setDate(start.getDate() - 29);

          const resMap = new Map<string, number>();
          for (const d of (json.data as Activity30Data).dailyData) {
            resMap.set(d.date, d.minutes);
          }

          for (let i = 0; i < 30; i++) {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            allDays.push({
              date: dateStr,
              day: d.toLocaleDateString('en-US', { weekday: 'narrow' }),
              isToday: dateStr === today.toISOString().split('T')[0],
            });
          }

          setDays(allDays);
          setActivityMap(resMap);
          const max = Math.max(...Array.from(resMap.values()), 1);
          setMaxMinutes(max);
        }
      } catch { /* silent */ }
    }
    fetchActivity();
  }, [userId]);

  function getIntensity(date: string): number {
    const mins = activityMap.get(date) || 0;
    if (mins === 0) return 0;
    return Math.min(1, mins / maxMinutes);
  }

  function getCellColor(intensity: number): string {
    if (intensity === 0) return 'bg-muted/40';
    if (intensity <= 0.25) return 'bg-cyan-300/40 dark:bg-cyan-700/40';
    if (intensity <= 0.5) return 'bg-cyan-400/60 dark:bg-cyan-600/50';
    if (intensity <= 0.75) return 'bg-cyan-500/70 dark:bg-cyan-500/60';
    return 'bg-cyan-600 dark:bg-cyan-400';
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500">
              <Flame className="h-4 w-4 text-white" />
            </div>
            Learning Streak
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm font-bold text-orange-600 dark:text-orange-400">
              <span className="text-base">🔥</span>
              <span className="count-up">{streak}</span>
              <span className="text-xs font-medium text-muted-foreground">days</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Streak stats row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5" />
              Current: <span className="font-semibold text-foreground">{streak} days</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              Best: <span className="font-semibold text-foreground">{bestStreak} days</span>
            </span>
          </div>
        </div>

        {/* 30-day grid - 6 columns x 5 rows */}
        <div>
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">Last 30 days</p>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
            {days.map((d) => {
              const intensity = getIntensity(d.date);
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${activityMap.get(d.date) || 0} min`}
                  className={`relative aspect-square rounded-sm transition-all duration-200 hover:scale-125 hover:ring-1 hover:ring-primary/30 ${getCellColor(intensity)} ${d.isToday ? 'ring-1 ring-primary' : ''}`}
                />
              );
            })}
          </div>
          {/* Intensity legend */}
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
            <span>Less</span>
            <div className="h-2.5 w-2.5 rounded-sm bg-muted/40" />
            <div className="h-2.5 w-2.5 rounded-sm bg-cyan-300/40 dark:bg-cyan-700/40" />
            <div className="h-2.5 w-2.5 rounded-sm bg-cyan-400/60 dark:bg-cyan-600/50" />
            <div className="h-2.5 w-2.5 rounded-sm bg-cyan-500/70 dark:bg-cyan-500/60" />
            <div className="h-2.5 w-2.5 rounded-sm bg-cyan-600 dark:bg-cyan-400" />
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Skills & Badges Grid                                               */
/* ------------------------------------------------------------------ */

interface SkillBadge {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  earned: boolean;
  condition: string;
}

function SkillsBadgesGrid({
  completedCourses,
  completedInOneDay,
  slidesViewed,
  commentCount,
  currentStreak,
}: {
  completedCourses: number;
  completedInOneDay: boolean;
  slidesViewed: number;
  commentCount: number;
  currentStreak: number;
}) {
  const badges: SkillBadge[] = [
    {
      id: 'course-master',
      name: 'Course Master',
      description: 'Completed 5+ courses',
      icon: Award,
      earned: completedCourses >= 5,
      condition: `${completedCourses}/5 courses`,
    },
    {
      id: 'quick-learner',
      name: 'Quick Learner',
      description: 'Completed a course in a day',
      icon: Zap,
      earned: completedInOneDay,
      condition: completedInOneDay ? 'Achieved' : 'Not yet',
    },
    {
      id: 'bookworm',
      name: 'Bookworm',
      description: 'Viewed 50+ slides',
      icon: BookOpen,
      earned: slidesViewed >= 50,
      condition: `${slidesViewed}/50 slides`,
    },
    {
      id: 'social-learner',
      name: 'Social Learner',
      description: 'Posted 5+ comments',
      icon: MessageSquare,
      earned: commentCount >= 5,
      condition: `${commentCount}/5 comments`,
    },
    {
      id: 'streak-champion',
      name: 'Streak Champion',
      description: '7+ day streak',
      icon: Flame,
      earned: currentStreak >= 7,
      condition: `${currentStreak}/7 days`,
    },
  ];

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
              <Star className="h-4 w-4 text-white" />
            </div>
            Skills & Badges
          </CardTitle>
          <Badge
            variant="secondary"
            className="gap-1 bg-gradient-to-r from-purple-600/10 to-pink-500/10 text-xs font-medium text-purple-700 dark:text-purple-400"
          >
            {badges.filter(b => b.earned).length}/{badges.length} earned
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="list" aria-label="Skill badges">
          {badges.map((badge) => {
            const IconComp = badge.icon;
            return (
              <div
                key={badge.id}
                className={`relative flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-all duration-200 ${
                  badge.earned
                    ? 'border-primary/20 bg-gradient-to-b from-primary/5 to-transparent shadow-sm badge-glow'
                    : 'border-border/30 bg-muted/20 opacity-50 grayscale'
                }`}
                role="listitem"
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 ${
                  badge.earned
                    ? 'bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-md'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {badge.earned ? <IconComp className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </div>
                <p className={`text-xs font-semibold leading-tight ${badge.earned ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {badge.name}
                </p>
                <p className="text-[10px] leading-tight text-muted-foreground">{badge.description}</p>
                <p className={`text-[10px] font-semibold ${badge.earned ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                  {badge.condition}
                </p>
                {badge.earned && (
                  <div className="absolute top-2 right-2">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600">
                      <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Learning Path Timeline                                             */
/* ------------------------------------------------------------------ */

function LearningPathTimeline({ enrollments }: { enrollments: EnrollmentData[] }) {
  const completed = enrollments
    .filter(e => e.status === 'completed' && e.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime());

  if (completed.length === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
              <Calendar className="h-4 w-4 text-white" />
            </div>
            Learning Path
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Complete courses to see your learning timeline here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
            <Calendar className="h-4 w-4 text-white" />
          </div>
          Learning Path
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start gap-0 min-w-max">
            {completed.map((enrollment, idx) => {
              const date = new Date(enrollment.completedAt!);
              const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <div key={enrollment.id} className="flex items-start">
                  {/* Node */}
                  <div className="flex flex-col items-center">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 shadow-md ${
                      idx === completed.length - 1
                        ? 'border-cyan-500 bg-gradient-to-br from-cyan-500 to-teal-500 text-white'
                        : 'border-emerald-400 bg-emerald-500 text-white'
                    }`}>
                      {idx === completed.length - 1 ? <Star className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
                    </div>
                    <p className="mt-1.5 max-w-[100px] text-center text-[10px] font-medium text-muted-foreground">
                      {dateStr}
                    </p>
                    <p className="mt-0.5 max-w-[100px] text-center text-[11px] font-semibold leading-tight text-foreground">
                      {enrollment.course.title.length > 20
                        ? enrollment.course.title.slice(0, 20) + '...'
                        : enrollment.course.title}
                    </p>
                  </div>
                  {/* Connector line */}
                  {idx < completed.length - 1 && (
                    <div className="mt-5 h-0.5 w-12 bg-gradient-to-r from-emerald-400 to-cyan-400" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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

/* ------------------------------------------------------------------ */
/*  Medal badge for top-3 ranks                                       */
/* ------------------------------------------------------------------ */

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-yellow-400 to-yellow-500 text-[11px] font-extrabold text-yellow-900 shadow-sm">
        1
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-300 via-gray-200 to-slate-300 text-[11px] font-extrabold text-gray-700 shadow-sm">
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 via-orange-500 to-amber-700 text-[11px] font-extrabold text-amber-100 shadow-sm">
        3
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
      {rank}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Leaderboard Skeleton                                              */
/* ------------------------------------------------------------------ */

function LeaderboardSkeleton() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Team Leaderboard Card                                             */
/* ------------------------------------------------------------------ */

function TeamLeaderboardCard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch('/api/leaderboard');
        const json = await res.json();
        if (json.success) {
          setEntries(json.data);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  if (loading) {
    return <LeaderboardSkeleton />;
  }

  const currentUser = entries.find((e) => e.isCurrentUser);
  const currentUserRank = currentUser?.rank;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
              <Trophy className="h-4 w-4 text-white" />
            </div>
            Team Leaderboard
          </CardTitle>
          {currentUserRank && (
            <Badge
              variant="secondary"
              className="gap-1 bg-gradient-to-r from-cyan-600/10 to-teal-500/10 text-xs font-medium text-cyan-700 dark:text-cyan-400"
            >
              <Medal className="h-3 w-3" />
              Your rank: #{currentUserRank}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const isMe = entry.isCurrentUser;
            const initials = entry.name
              .split(' ')
              .map((w) => w.charAt(0).toUpperCase())
              .slice(0, 2)
              .join('');

            return (
              <div
                key={entry.id}
                className={`group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 ${
                  isMe
                    ? 'bg-primary/5 ring-1 ring-primary/15'
                    : 'hover:bg-muted/50'
                }`}
              >
                {/* Rank badge */}
                <RankBadge rank={entry.rank} />

                {/* Avatar */}
                <Avatar className="h-8 w-8 border border-border/50">
                  <AvatarFallback
                    className={`text-xs font-semibold ${
                      isMe
                        ? 'bg-gradient-to-br from-cyan-600 to-teal-500 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>

                {/* Name + Department */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium leading-tight ${
                      isMe ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {entry.name}
                    {isMe && (
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        (You)
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {entry.department}
                  </p>
                </div>

                {/* Score */}
                <div className="text-right">
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      isMe ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {entry.score.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    pts
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Banner skeleton */}
      <Skeleton className="h-40 w-full rounded-2xl skeleton-shimmer" />
      {/* Cards skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm skeleton-shimmer opacity-0" style={{ animation: `viewFadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 80ms forwards` }}>
          <CardHeader className="pb-4">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <Skeleton className="h-36 w-36 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Skeleton className="h-6 w-8" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm skeleton-shimmer opacity-0" style={{ animation: `viewFadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 160ms forwards` }}>
          <CardHeader className="pb-4">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Learning path timeline skeleton */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm skeleton-shimmer opacity-0" style={{ animation: `viewFadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 240ms forwards` }}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-5 w-28" />
          </div>
        </CardHeader>
        <CardContent>
          <SkeletonList count={3} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Profile Page                                                  */
/* ------------------------------------------------------------------ */

export function ProfilePage() {
  const { currentUserId, currentRole, logout } = useUserStore();
  const { navigateTo } = useNavigationStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [firstCompletedCourse, setFirstCompletedCourse] = useState<string | null>(null);
  const [completedDate, setCompletedDate] = useState<string | null>(null);

  // New state for XP / streak / badges / timeline
  const [enrollments, setEnrollments] = useState<EnrollmentData[]>([]);
  const [streakData, setStreakData] = useState({ current: 0, longest: 0 });

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/${currentUserId}`);
      const json = await res.json();
      if (json.success) {
        setProfile(json.data);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  // Fetch enrollments for XP, timeline, badges, and certificate
  useEffect(() => {
    async function fetchEnrollments() {
      try {
        const res = await fetch('/api/enrollments?userId=' + currentUserId);
        const json = await res.json();
        if (json.success && json.data) {
          setEnrollments(json.data);
          const completed = json.data.find(
            (e: { status: string; course: { title: string }; completedAt: string | null }) =>
              e.status === 'completed' && e.completedAt
          );
          if (completed) {
            setFirstCompletedCourse(completed.course.title);
            setCompletedDate(completed.completedAt);
          }
        }
      } catch {
        /* silent */
      }
    }
    fetchEnrollments();
  }, [currentUserId]);

  // Fetch activity for streak data (used by StreakCalendar and SkillsBadgesGrid)
  useEffect(() => {
    async function fetchStreak() {
      try {
        const res = await fetch(`/api/activity?userId=${currentUserId}&weeks=5`);
        const json = await res.json();
        if (json.success && json.data) {
          setStreakData(json.data.streak);
        }
      } catch {
        /* silent */
      }
    }
    fetchStreak();
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">
          Unable to load profile
        </p>
      </div>
    );
  }

  const initials = (profile.name || profile.email)
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  const joinDate = new Date(profile.createdAt).toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric",
    }
  );

  const completedPercent =
    profile.stats.totalCourses > 0
      ? Math.round(
          (profile.stats.completed / profile.stats.totalCourses) * 100
        )
      : 0;

  /* ---- XP calculation ---- */
  const completedEnrollments = enrollments.filter(e => e.status === 'completed');
  const xpFromCompletedCourses = completedEnrollments.length * 100;
  const xpFromLessons = enrollments.reduce((sum, e) => {
    // Each lesson = 10 XP; estimate completed lessons from progress percentage
    const completedLessons = Math.round((e.progress / 100) * (e.course.lessonsCount || 0));
    return sum + completedLessons * 10;
  }, 0);
  const totalXP = xpFromCompletedCourses + xpFromLessons;
  const level = Math.floor(totalXP / 500) + 1;
  const progressToNext = (totalXP % 500) / 5; // percentage toward next 500 XP

  /* ---- Badge condition helpers ---- */
  const completedInOneDay = completedEnrollments.some(e => {
    if (!e.completedAt || !e.enrolledAt) return false;
    const enrolled = new Date(e.enrolledAt);
    const completed = new Date(e.completedAt);
    const diffMs = completed.getTime() - enrolled.getTime();
    return diffMs <= 24 * 60 * 60 * 1000;
  });
  // Estimate total slides viewed: each completed lesson ~ 10 slides
  const totalSlidesViewed = enrollments.reduce((sum, e) => {
    const completedLessons = Math.round((e.progress / 100) * (e.course.lessonsCount || 0));
    return sum + completedLessons * 10;
  }, 0);
  // Comment count: use a mock estimate (no comments API tied to user)
  const commentCount = 3; // placeholder; adjust when comments API supports user filtering

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account and view learning overview
        </p>
      </div>

      {/* Profile Banner */}
      <div className="relative overflow-hidden rounded-2xl">
        {/* Gradient background with decorative patterns */}
        <div className="relative bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 px-6 pb-20 pt-8 sm:px-8 sm:pb-24 sm:pt-10">
          {/* Decorative geometric shapes */}
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute top-6 right-1/4 h-20 w-20 rounded-full bg-white/5" />
          {/* Diamond shape */}
          <div className="absolute top-4 left-1/3 h-16 w-16 rotate-45 rounded-sm border border-white/10" />
          {/* Small circle */}
          <div className="absolute bottom-8 right-12 h-6 w-6 rounded-full bg-white/10" />
          {/* Dots pattern */}
          <div className="absolute top-1/2 left-8 grid grid-cols-3 gap-2 opacity-20">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-white" />
            ))}
          </div>
          {/* Triangle hint */}
          <div className="absolute right-16 bottom-4 h-0 w-0 border-l-[12px] border-r-[12px] border-b-[20px] border-l-transparent border-r-transparent border-b-white/10" />
        </div>

        {/* Profile info overlapping the banner */}
        <div className="relative mx-4 -mt-12 sm:mx-6">
          <div className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:gap-5 sm:p-6">
            {/* Avatar with animated ring */}
            <div className="flex items-start sm:items-center">
              <div className="relative">
                {/* Animated ring */}
                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 opacity-60 blur-[2px] animate-[pulse_3s_ease-in-out_infinite]" />
                <Avatar className="relative h-20 w-20 border-4 border-card shadow-lg">
                  <AvatarFallback className="bg-gradient-to-br from-cyan-600 to-teal-500 text-2xl font-bold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">
                  {profile.name || "Unnamed User"}
                </h2>
                {/* Role badge */}
                <Badge className="gap-1 bg-gradient-to-r from-cyan-600 to-teal-500 text-[10px] font-semibold text-white hover:from-cyan-700 hover:to-teal-600">
                  <Shield className="h-3 w-3" />
                  {profile.role}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {profile.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {profile.department && (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-xs"
                  >
                    <Building2 className="h-3 w-3" />
                    {profile.department}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Joined {joinDate}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats + Quick Actions */}
      <div className={currentRole === "instructor" ? "" : "grid gap-6 md:grid-cols-2"}>
        {/* Stats Panel - STUDENT ONLY */}
        {currentRole === "student" && (
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              Learning Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Circular Progress */}
            <div className="flex justify-center">
              <CircularProgress percentage={completedPercent} />
            </div>

            {/* Enhanced stat cards with glass-morphism & animated counters */}
            <div className="grid grid-cols-3 gap-3">
              <EnhancedStatCard
                icon={BookOpen}
                label="Total Courses"
                value={profile.stats.totalCourses}
                color="bg-gradient-to-br from-blue-500 to-blue-700"
                trend={{ value: 12, direction: 'up' }}
              />
              <EnhancedStatCard
                icon={CheckCircle}
                label="Completed"
                value={profile.stats.completed}
                color="bg-gradient-to-br from-emerald-500 to-emerald-700"
                trend={{ value: 25, direction: 'up' }}
              />
              <EnhancedStatCard
                icon={Clock}
                label="In Progress"
                value={profile.stats.inProgress}
                color="bg-gradient-to-br from-amber-500 to-amber-700"
                trend={{ value: 8, direction: 'down' }}
              />
            </div>
          </CardContent>
        </Card>
        )}

        {/* Quick Actions */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Create Course - INSTRUCTOR ONLY */}
            {currentRole === "instructor" && (
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-cyan-600/5 to-teal-500/5 p-4 text-left transition-all duration-200 hover:border-cyan-500/30 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-teal-500/10 hover:shadow-sm"
              onClick={() => navigateTo("create-course")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Create Course
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Build and publish a new learning course
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
            )}

            {/* Browse Courses */}
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-emerald-600/5 to-cyan-500/5 p-4 text-left transition-all duration-200 hover:border-emerald-500/30 hover:bg-gradient-to-r hover:from-emerald-600/10 hover:to-cyan-500/10 hover:shadow-sm"
              onClick={() => navigateTo("courses")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-cyan-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <LayoutGrid className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Browse Courses
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Explore the full course catalog
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>

            {/* View Certificate - STUDENT ONLY */}
            {currentRole === "student" && (
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-cyan-600/5 to-teal-500/5 p-4 text-left transition-all duration-200 hover:border-cyan-500/30 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-teal-500/10 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-cyan-600/5 disabled:hover:to-teal-500/5 disabled:hover:border-border/50 disabled:hover:shadow-none"
              onClick={() => {
                if (firstCompletedCourse && completedDate) {
                  setCertificateOpen(true);
                } else {
                  toast.info("Complete a course to earn a certificate!");
                }
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <FileBadge className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  View Certificate
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {firstCompletedCourse
                    ? `View cert for "${firstCompletedCourse.length > 30 ? firstCompletedCourse.slice(0, 30) + '...' : firstCompletedCourse}"`
                    : "Complete a course to earn a certificate"}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
            )}

            {/* My Learning - STUDENT ONLY */}
            {currentRole === "student" && (
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-amber-600/5 to-orange-500/5 p-4 text-left transition-all duration-200 hover:border-amber-500/30 hover:bg-gradient-to-r hover:from-amber-600/10 hover:to-orange-500/10 hover:shadow-sm"
              onClick={() => navigateTo("my-learning")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  My Learning
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Track your progress and enrolled courses
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
            )}

            {/* Retake Tour */}
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-violet-600/5 to-purple-500/5 p-4 text-left transition-all duration-200 hover:border-violet-500/30 hover:bg-gradient-to-r hover:from-violet-600/10 hover:to-purple-500/10 hover:shadow-sm"
              onClick={() => {
                localStorage.removeItem("ecotech_onboarding_done");
                toast.success("Tour will show on next page refresh!");
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Retake Tour
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Replay the welcome guide and feature overview
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>

            <Separator className="my-2" />

            {/* Logout */}
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                logout();
                toast.success("You have been logged out.");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Course Bookmark Collections - STUDENT ONLY */}
      {currentRole === "student" && <CourseBookmarks />}

      {/* Student-only widgets */}
      {currentRole === "student" && (
      <>
      {/* XP Display + Streak Calendar */}
      <div className="grid gap-6 md:grid-cols-2">
        <XPDisplay totalXP={totalXP} level={level} progressToNext={progressToNext} />
        <StreakCalendar streak={streakData.current} bestStreak={streakData.longest} userId={currentUserId} />
      </div>

      {/* Skills & Badges Grid */}
      <SkillsBadgesGrid
        completedCourses={profile.stats.completed}
        completedInOneDay={completedInOneDay}
        slidesViewed={totalSlidesViewed}
        commentCount={commentCount}
        currentStreak={streakData.current}
      />

      {/* Learning Path Timeline */}
      <LearningPathTimeline enrollments={enrollments} />

      {/* XP Level Progress (Full) */}
      <XpBarFull userId={profile.id} />

      {/* Weekly Activity Chart */}
      <ActivityChart userId={profile.id} />

      {/* Team Leaderboard */}
      <TeamLeaderboardCard />

      {/* Achievement Badges */}
      <AchievementBadges stats={profile.stats} />
      </>
      )}

      {/* Certificate Modal - STUDENT ONLY */}
      {currentRole === "student" && (
      <CertificateModal
        open={certificateOpen}
        onOpenChange={setCertificateOpen}
        userName={profile?.name || profile?.email || "Learner"}
        courseName={firstCompletedCourse || "Course"}
        completionDate={completedDate || new Date().toISOString()}
      />
      )}
    </div>
  );
}
