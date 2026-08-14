"use client";

import { useState, useEffect, useMemo } from "react";
import {
  BookOpen,
  Clock,
  CheckCircle,
  Flame,
  Star,
  Users,
  GraduationCap,
  Trophy,
  BarChart3,
  TrendingUp,
  Award,
  ArrowUpRight,
  Calendar,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUserStore, useNavigationStore } from "@/stores/lms-store";
import { cn } from "@/lib/utils";

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

interface AnalyticsData {
  stats: StatsCard;
  courseProgress: CourseProgress[];
  categoryDistribution: CategoryDistribution[];
  recentActivity: RecentActivity[];
  topCourses: TopCourse[];
}

/* ------------------------------------------------------------------ */
/*  Activity icon mapping                                              */
/* ------------------------------------------------------------------ */

function ActivityIcon({ type }: { type: RecentActivity["type"] }) {
  switch (type) {
    case "enrollment":
      return <GraduationCap className="h-4 w-4 text-teal-500" />;
    case "completion":
      return <Trophy className="h-4 w-4 text-amber-500" />;
    case "rating":
      return <Star className="h-4 w-4 text-yellow-500" />;
    case "progress":
      return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    default:
      return <BarChart3 className="h-4 w-4 text-muted-foreground" />;
  }
}

/* ------------------------------------------------------------------ */
/*  Seeded random for consistent sparkline data                        */
/* ------------------------------------------------------------------ */

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* ------------------------------------------------------------------ */
/*  Sparkline Mini Chart                                               */
/* ------------------------------------------------------------------ */

function SparklineChart({
  data,
  gradientFrom,
  gradientTo,
}: {
  data: number[];
  gradientFrom: string;
  gradientTo: string;
}) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-[3px] h-8">
      {data.map((val, i) => {
        const height = Math.max(4, (val / max) * 100);
        return (
          <div
            key={i}
            className={cn(
              "w-[6px] rounded-full transition-all duration-500",
              `bg-gradient-to-t ${gradientFrom} ${gradientTo}`
            )}
            style={{
              height: `${height}%`,
              opacity: 0.5 + (i / data.length) * 0.5,
              animationDelay: `${i * 60}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card Component (with Sparkline)                               */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  gradient: string;
  gradientFrom: string;
  gradientTo: string;
  delay: number;
  seed: number;
}

function StatCard({
  icon,
  label,
  value,
  gradient,
  gradientFrom,
  gradientTo,
  delay,
  seed,
}: StatCardProps) {
  const sparkData = useMemo(() => {
    const rand = seededRandom(seed);
    return Array.from({ length: 7 }, () => 20 + rand() * 80);
  }, [seed]);

  return (
    <Card
      className="glass-card stat-pop hover-lift overflow-hidden border-border/50 transition-shadow hover:shadow-lg"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md transition-transform duration-200 hover:scale-110",
              gradient
            )}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </p>
            <p className="text-2xl font-bold tracking-tight text-foreground leading-tight">
              {value}
            </p>
          </div>
          <div className="shrink-0 opacity-60">
            <SparklineChart
              data={sparkData}
              gradientFrom={gradientFrom}
              gradientTo={gradientTo}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated Progress Bar                                              */
/* ------------------------------------------------------------------ */

function AnimatedProgressBar({
  value,
  isCompleted,
}: {
  value: number;
  isCompleted: boolean;
}) {
  const [animatedWidth, setAnimatedWidth] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedWidth(value), 100);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-1000 ease-out",
          isCompleted
            ? "bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500"
            : "bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500"
        )}
        style={{ width: `${animatedWidth}%` }}
      >
        {/* Shimmer effect */}
        <div
          className={cn(
            "absolute inset-0 opacity-0",
            animatedWidth > 10 && "opacity-100"
          )}
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
            animation: "shimmer 2s infinite",
          }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Donut Chart                                                        */
/* ------------------------------------------------------------------ */

function DonutChart({
  data,
  total,
}: {
  data: { categoryName: string; categoryColor: string | null; courseCount: number }[];
  total: number;
}) {
  // Build conic-gradient
  const gradientParts: string[] = [];
  let currentAngle = 0;

  const DONUT_COLORS = [
    "#14b8a6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
    "#f97316",
  ];

  data.forEach((item, i) => {
    const color = item.categoryColor || DONUT_COLORS[i % DONUT_COLORS.length];
    const angle = total > 0 ? (item.courseCount / total) * 360 : 0;
    gradientParts.push(`${color} ${currentAngle}deg ${currentAngle + angle}deg`);
    currentAngle += angle;
  });

  const gradientStr =
    gradientParts.length > 0
      ? `conic-gradient(${gradientParts.join(", ")})`
      : "conic-gradient(#e5e7eb 0deg 360deg)";

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Donut */}
      <div
        className="relative h-40 w-40 sm:h-48 sm:w-48 rounded-full stat-pop"
        style={{
          background: gradientStr,
        }}
      >
        {/* Inner circle (donut hole) */}
        <div className="absolute inset-0 m-auto h-[60%] w-[60%] rounded-full bg-card flex flex-col items-center justify-center shadow-inner">
          <span className="text-2xl font-bold text-foreground">{total}</span>
          <span className="text-[11px] text-muted-foreground">courses</span>
        </div>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 w-full max-w-[220px]">
        {data.map((item, i) => {
          const color =
            item.categoryColor || DONUT_COLORS[i % DONUT_COLORS.length];
          const pct = total > 0 ? Math.round((item.courseCount / total) * 100) : 0;
          return (
            <div key={item.categoryName} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0">
                <span className="text-xs text-foreground truncate block">
                  {item.categoryName}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Weekly Heatmap                                                     */
/* ------------------------------------------------------------------ */

function WeeklyHeatmap({
  userId,
}: {
  userId: string;
}) {
  const [heatmapData, setHeatmapData] = useState<number[][]>([]);
  const [monthLabels, setMonthLabels] = useState<string[]>([]);

  useEffect(() => {
    async function fetchHeatmap() {
      try {
        const res = await fetch(`/api/activity?userId=${userId}`);
        const json = await res.json();
        if (json.success && json.data && json.data.dailyData) {
          // Use the activity data to build a heatmap
          const activityMap: Record<string, number> = {};
          const activities = json.data.dailyData;
          for (const act of activities) {
            const dateStr = act.date;
            // Use minutes to derive activity level
            const minutes = act.minutes || 0;
            // Keep the max minutes per day
            const existing = activityMap[dateStr] || 0;
            activityMap[dateStr] = Math.max(existing, minutes);
          }

          // Build 12-week × 7-day grid
          const grid: number[][] = [];
          const today = new Date();
          const months: string[] = [];
          const seenMonths = new Set<string>();

          // Start from 12 weeks ago, aligned to Sunday
          const startDate = new Date(today);
          startDate.setDate(startDate.getDate() - 83); // ~12 weeks
          const dayOfWeek = startDate.getDay();
          startDate.setDate(startDate.getDate() - dayOfWeek); // Align to Sunday

          for (let week = 0; week < 12; week++) {
            for (let day = 0; day < 7; day++) {
              if (day === 0) grid.push([]);
              const cellDate = new Date(startDate);
              cellDate.setDate(cellDate.getDate() + week * 7 + day);
              const dateStr = cellDate.toISOString().split("T")[0];
              grid[week].push(activityMap[dateStr] || 0);

              // Convert minutes to 0-4 level for heatmap coloring
              const mins = activityMap[dateStr] || 0;
              if (mins === 0) {
                // already 0
              } else {
                // Normalize: 0=none, 1=1-30min, 2=31-60min, 3=61-90min, 4=91+min
                grid[week][day] = mins <= 30 ? 1 : mins <= 60 ? 2 : mins <= 90 ? 3 : 4;
              }
              if (day === 0) {
                const monthName = cellDate.toLocaleString("en-US", {
                  month: "short",
                });
                if (!seenMonths.has(monthName)) {
                  seenMonths.add(monthName);
                  months.push(monthName);
                } else {
                  months.push("");
                }
              }
            }
          }

          setHeatmapData(grid);
          setMonthLabels(months);
        }
      } catch {
        // Generate fallback random data
        const rand = seededRandom(42);
        const grid: number[][] = [];
        for (let week = 0; week < 12; week++) {
          grid.push([]);
          for (let day = 0; day < 7; day++) {
            grid[week].push(Math.floor(rand() * 5));
          }
        }
        setHeatmapData(grid);
        setMonthLabels(["Jan", "", "Feb", "", "Mar", "", "Apr"]);
      }
    }
    fetchHeatmap();
  }, [userId]);

  const dayLabels = ["Sun", "", "Tue", "", "Thu", "", "Sat"];

  const getHeatColor = (level: number) => {
    switch (level) {
      case 0:
        return "bg-muted";
      case 1:
        return "bg-emerald-200 dark:bg-emerald-900/50";
      case 2:
        return "bg-emerald-300 dark:bg-emerald-800/60";
      case 3:
        return "bg-emerald-400 dark:bg-emerald-700/70";
      default:
        return "bg-emerald-500 dark:bg-emerald-600";
    }
  };

  if (heatmapData.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-2">
        {/* Month labels */}
        <div className="flex gap-0.5 pl-8">
          {monthLabels.map((label, i) => (
            <div
              key={i}
              className="flex-1 min-w-0"
            >
              <span className="text-[9px] text-muted-foreground truncate">
                {label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-1.5">
          {/* Day labels */}
          <div className="flex flex-col gap-0.5 shrink-0 pt-0">
            {dayLabels.map((label, i) => (
              <div key={i} className="h-[14px] flex items-center">
                <span className="text-[9px] text-muted-foreground w-7 text-right pr-1.5">
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          <div className="flex gap-[3px] flex-1 overflow-x-auto">
            {heatmapData.map((week, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-[3px]">
                {week.map((level, dayIdx) => (
                  <Tooltip key={dayIdx}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          "h-[14px] w-[14px] rounded-[3px] transition-colors hover:ring-1 hover:ring-foreground/20",
                          getHeatColor(level)
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {level > 0
                        ? `${level === 1 ? "<30" : level === 2 ? "31-60" : level === 3 ? "61-90" : "90+"} min`
                        : "No activity"}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <div
              key={level}
              className={cn("h-[10px] w-[10px] rounded-[2px]", getHeatColor(level))}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ------------------------------------------------------------------ */
/*  Star Rating Component                                              */
/* ------------------------------------------------------------------ */

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5",
            i < Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "fill-muted text-muted"
          )}
        />
      ))}
      <span className="ml-1 text-xs font-medium text-muted-foreground">
        {rating.toFixed(1)}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                     */
/* ------------------------------------------------------------------ */

export function DashboardPage() {
  const { currentUserId } = useUserStore();
  const { openCourseDetail } = useNavigationStore();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch(`/api/analytics?userId=${currentUserId}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || "Failed to load analytics");
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [currentUserId]);

  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center px-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <BarChart3 className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          Something went wrong
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="content-reveal mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 shadow-md">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight gradient-text">
              Analytics Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Track your learning progress and performance
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : data ? (
        <div className="space-y-6">
          {/* ---- Top Stats Row ---- */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              icon={<BookOpen className="h-5 w-5 text-white" />}
              label="Courses Enrolled"
              value={data.stats.totalEnrolled}
              gradient="from-teal-500 to-cyan-600"
              gradientFrom="from-teal-400"
              gradientTo="to-cyan-300"
              delay={0}
              seed={101}
            />
            <StatCard
              icon={<Clock className="h-5 w-5 text-white" />}
              label="Hours of Study"
              value={data.stats.hoursStudied}
              gradient="from-amber-500 to-orange-500"
              gradientFrom="from-amber-400"
              gradientTo="to-orange-300"
              delay={50}
              seed={202}
            />
            <StatCard
              icon={<CheckCircle className="h-5 w-5 text-white" />}
              label="Courses Completed"
              value={data.stats.coursesCompleted}
              gradient="from-emerald-500 to-green-600"
              gradientFrom="from-emerald-400"
              gradientTo="to-green-300"
              delay={100}
              seed={303}
            />
            <StatCard
              icon={<Flame className="h-5 w-5 text-white" />}
              label="Current Streak"
              value={`${data.stats.currentStreak} days`}
              gradient="from-rose-500 to-pink-600"
              gradientFrom="from-rose-400"
              gradientTo="to-pink-300"
              delay={150}
              seed={404}
            />
          </div>

          {/* ---- Charts Row ---- */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Learning Progress Chart */}
            <Card className="glass-card content-reveal-delay-1 content-reveal hover-lift border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base gradient-text">
                  <TrendingUp className="h-4 w-4 text-teal-500" />
                  Learning Progress
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.courseProgress.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No courses enrolled yet
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() =>
                        useNavigationStore.getState().navigateTo("courses")
                      }
                    >
                      Browse Courses
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                    {data.courseProgress.map((cp) => (
                      <div key={cp.courseId}>
                        <div className="mb-1.5 flex items-center justify-between">
                          <span className="max-w-[200px] truncate text-sm font-medium text-foreground">
                            {cp.courseTitle}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-semibold shrink-0",
                              cp.progress === 100
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                            )}
                          >
                            {cp.progress}%
                          </Badge>
                        </div>
                        <AnimatedProgressBar
                          value={cp.progress}
                          isCompleted={cp.progress === 100}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Distribution - Donut Chart */}
            <Card className="glass-card content-reveal-delay-2 content-reveal hover-lift border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base gradient-text">
                  <Award className="h-4 w-4 text-amber-500" />
                  Category Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.categoryDistribution.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <BarChart3 className="h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No category data yet
                    </p>
                  </div>
                ) : (
                  <DonutChart
                    data={data.categoryDistribution}
                    total={data.categoryDistribution.reduce(
                      (sum, c) => sum + c.courseCount,
                      0
                    )}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ---- Weekly Heatmap Section ---- */}
          <Card className="glass-card content-reveal-delay-2 content-reveal hover-lift border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base gradient-text">
                <Calendar className="h-4 w-4 text-teal-500" />
                Learning Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WeeklyHeatmap userId={currentUserId} />
            </CardContent>
          </Card>

          {/* ---- Bottom Row ---- */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Recent Activity Feed */}
            <Card className="glass-card content-reveal-delay-3 content-reveal hover-lift border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base gradient-text">
                  <Clock className="h-4 w-4 text-emerald-500" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.recentActivity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Clock className="h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No recent activity
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                    {data.recentActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <ActivityIcon type={activity.type} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">
                            <span className="font-medium">
                              {activity.description}
                            </span>{" "}
                            <span className="truncate">{activity.courseTitle}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {activity.timestamp}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top Courses Card */}
            <Card className="glass-card content-reveal-delay-4 content-reveal hover-lift border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base gradient-text">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Top Rated Courses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.topCourses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Star className="h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No rated courses yet
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.topCourses.map((course, index) => (
                      <button
                        key={course.courseId}
                        onClick={() => openCourseDetail(course.courseId)}
                        className="group flex w-full items-center gap-3 rounded-xl border border-border/50 p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm"
                      >
                        {/* Rank number */}
                        <div
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white",
                            index === 0
                              ? "bg-gradient-to-br from-amber-400 to-yellow-500"
                              : index === 1
                                ? "bg-gradient-to-br from-slate-300 to-slate-400"
                                : "bg-gradient-to-br from-amber-600 to-orange-600"
                          )}
                        >
                          {index + 1}
                        </div>
                        {/* Course info */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {course.courseTitle}
                          </p>
                          <div className="mt-1 flex items-center gap-3">
                            <StarRating rating={course.rating} />
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {course.studentCount} students
                            </span>
                          </div>
                        </div>
                        {/* Category */}
                        {course.categoryName && (
                          <Badge
                            variant="secondary"
                            className="shrink-0 text-[10px]"
                            style={
                              course.categoryColor
                                ? {
                                    backgroundColor: `${course.categoryColor}20`,
                                    color: course.categoryColor,
                                    borderColor: `${course.categoryColor}40`,
                                  }
                                : undefined
                            }
                          >
                            {course.categoryName}
                          </Badge>
                        )}
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats row skeleton */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-11 w-11 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-7 w-16" />
                </div>
                <Skeleton className="h-8 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-4 w-10 rounded" />
                </div>
                <Skeleton className="h-3 w-full rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent className="flex justify-center py-6">
            <Skeleton className="h-44 w-44 rounded-full" />
          </CardContent>
        </Card>
      </div>

      {/* Heatmap skeleton */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-36" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-28 w-full rounded-lg" />
        </CardContent>
      </Card>

      {/* Bottom row skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-16" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-border/50 p-3"
              >
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
