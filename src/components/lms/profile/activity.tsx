"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle,
  Flame,
  Lock,
  MessageSquare,
  Star,
  Trophy,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ActivityDayEntry, Activity30Data, EnrollmentData } from "@/types/lms";

export function StreakCalendar({ streak, bestStreak }: { streak: number; bestStreak: number }) {
  const [activityMap, setActivityMap] = useState<Map<string, number>>(new Map());
  const [days, setDays] = useState<Array<{ date: string; day: string; isToday: boolean }>>([]);
  const [maxMinutes, setMaxMinutes] = useState(1);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch("/api/activity?weeks=5");
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
            const dateStr = d.toISOString().split("T")[0];
            allDays.push({
              date: dateStr,
              day: d.toLocaleDateString("en-US", { weekday: "narrow" }),
              isToday: dateStr === today.toISOString().split("T")[0],
            });
          }

          setDays(allDays);
          setActivityMap(resMap);
          const max = Math.max(...Array.from(resMap.values()), 1);
          setMaxMinutes(max);
        }
      } catch {
        /* silent */
      }
    }
    fetchActivity();
  }, []);

  function getIntensity(date: string): number {
    const mins = activityMap.get(date) || 0;
    if (mins === 0) return 0;
    return Math.min(1, mins / maxMinutes);
  }

  function getCellColor(intensity: number): string {
    if (intensity === 0) return "bg-muted/40";
    if (intensity <= 0.25) return "bg-cyan-300/40 dark:bg-cyan-700/40";
    if (intensity <= 0.5) return "bg-cyan-400/60 dark:bg-cyan-600/50";
    if (intensity <= 0.75) return "bg-cyan-500/70 dark:bg-cyan-500/60";
    return "bg-cyan-600 dark:bg-cyan-400";
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
              <span className="text-muted-foreground text-xs font-medium">days</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Streak stats row */}
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5" />
              Current: <span className="text-foreground font-semibold">{streak} days</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" />
              Best: <span className="text-foreground font-semibold">{bestStreak} days</span>
            </span>
          </div>
        </div>

        {/* 30-day grid - 6 columns x 5 rows */}
        <div>
          <p className="text-muted-foreground mb-2 text-[11px] font-medium">Last 30 days</p>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
            {days.map((d) => {
              const intensity = getIntensity(d.date);
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${activityMap.get(d.date) || 0} min`}
                  className={`hover:ring-primary/30 relative aspect-square rounded-sm transition-all duration-200 hover:scale-125 hover:ring-1 ${getCellColor(intensity)} ${d.isToday ? "ring-primary ring-1" : ""}`}
                />
              );
            })}
          </div>
          {/* Intensity legend */}
          <div className="text-muted-foreground mt-2 flex items-center justify-end gap-1 text-[10px]">
            <span>Less</span>
            <div className="bg-muted/40 h-2.5 w-2.5 rounded-sm" />
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
export interface SkillBadge {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  earned: boolean;
  condition: string;
}
export function SkillsBadgesGrid({
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
      id: "course-master",
      name: "Course Master",
      description: "Completed 5+ courses",
      icon: Award,
      earned: completedCourses >= 5,
      condition: `${completedCourses}/5 courses`,
    },
    {
      id: "quick-learner",
      name: "Quick Learner",
      description: "Completed a course in a day",
      icon: Zap,
      earned: completedInOneDay,
      condition: completedInOneDay ? "Achieved" : "Not yet",
    },
    {
      id: "bookworm",
      name: "Bookworm",
      description: "Viewed 50+ slides",
      icon: BookOpen,
      earned: slidesViewed >= 50,
      condition: `${slidesViewed}/50 slides`,
    },
    {
      id: "social-learner",
      name: "Social Learner",
      description: "Posted 5+ comments",
      icon: MessageSquare,
      earned: commentCount >= 5,
      condition: `${commentCount}/5 comments`,
    },
    {
      id: "streak-champion",
      name: "Streak Champion",
      description: "7+ day streak",
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
            {badges.filter((b) => b.earned).length}/{badges.length} earned
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          role="list"
          aria-label="Skill badges"
        >
          {badges.map((badge) => {
            const IconComp = badge.icon;
            return (
              <div
                key={badge.id}
                className={`relative flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-all duration-200 ${
                  badge.earned
                    ? "border-primary/20 from-primary/5 badge-glow bg-gradient-to-b to-transparent shadow-sm"
                    : "border-border/30 bg-muted/20 opacity-50 grayscale"
                }`}
                role="listitem"
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 ${
                    badge.earned
                      ? "bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-md"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {badge.earned ? <IconComp className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
                </div>
                <p
                  className={`text-xs leading-tight font-semibold ${badge.earned ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {badge.name}
                </p>
                <p className="text-muted-foreground text-[10px] leading-tight">
                  {badge.description}
                </p>
                <p
                  className={`text-[10px] font-semibold ${badge.earned ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
                >
                  {badge.condition}
                </p>
                {badge.earned && (
                  <div className="absolute top-2 right-2">
                    <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600">
                      <svg
                        className="h-2.5 w-2.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
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
export function LearningPathTimeline({ enrollments }: { enrollments: EnrollmentData[] }) {
  const completed = enrollments
    .filter((e) => e.status === "completed" && e.completedAt)
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
          <p className="text-muted-foreground text-sm">
            Complete courses to see your learning timeline here.
          </p>
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
          <div className="flex min-w-max items-start gap-0">
            {completed.map((enrollment, idx) => {
              const date = new Date(enrollment.completedAt!);
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              return (
                <div key={enrollment.id} className="flex items-start">
                  {/* Node */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 shadow-md ${
                        idx === completed.length - 1
                          ? "border-cyan-500 bg-gradient-to-br from-cyan-500 to-teal-500 text-white"
                          : "border-emerald-400 bg-emerald-500 text-white"
                      }`}
                    >
                      {idx === completed.length - 1 ? (
                        <Star className="h-4 w-4" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                    </div>
                    <p className="text-muted-foreground mt-1.5 max-w-[100px] text-center text-[10px] font-medium">
                      {dateStr}
                    </p>
                    <p className="text-foreground mt-0.5 max-w-[100px] text-center text-[11px] leading-tight font-semibold">
                      {enrollment.course.title.length > 20
                        ? enrollment.course.title.slice(0, 20) + "..."
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
