"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
/*  Stat Card Component                                                */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  gradient: string;
  delay: number;
}

function StatCard({ icon, label, value, gradient, delay }: StatCardProps) {
  return (
    <Card
      className="glass-card stat-pop overflow-hidden border-border/50 transition-shadow hover:shadow-lg"
      style={{ animationDelay: `${delay}ms` }}
    >
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-md transition-transform duration-200 hover:scale-110",
              gradient
            )}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold tracking-tight text-foreground">
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
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
              delay={0}
            />
            <StatCard
              icon={<Clock className="h-5 w-5 text-white" />}
              label="Hours of Study"
              value={data.stats.hoursStudied}
              gradient="from-amber-500 to-orange-500"
              delay={50}
            />
            <StatCard
              icon={<CheckCircle className="h-5 w-5 text-white" />}
              label="Courses Completed"
              value={data.stats.coursesCompleted}
              gradient="from-emerald-500 to-green-600"
              delay={100}
            />
            <StatCard
              icon={<Flame className="h-5 w-5 text-white" />}
              label="Current Streak"
              value={`${data.stats.currentStreak} days`}
              gradient="from-rose-500 to-pink-600"
              delay={150}
            />
          </div>

          {/* ---- Charts Row ---- */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Learning Progress Chart */}
            <Card className="glass-card content-reveal-delay-1 content-reveal border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
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
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                    {data.courseProgress.map((cp) => (
                      <div key={cp.courseId}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="max-w-[200px] truncate text-sm font-medium text-foreground">
                            {cp.courseTitle}
                          </span>
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] font-semibold",
                              cp.status === "completed"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                            )}
                          >
                            {cp.progress}%
                          </Badge>
                        </div>
                        <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-700 ease-out",
                              cp.progress === 100
                                ? "bg-gradient-to-r from-teal-500 to-emerald-500"
                                : "bg-gradient-to-r from-amber-400 to-orange-500"
                            )}
                            style={{ width: `${cp.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Category Distribution */}
            <Card className="glass-card content-reveal-delay-2 content-reveal border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
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
                  <div className="space-y-3">
                    {data.categoryDistribution.map((cat) => {
                      const maxCount = Math.max(
                        ...data.categoryDistribution.map((c) => c.courseCount)
                      );
                      const barWidth =
                        maxCount > 0
                          ? (cat.courseCount / maxCount) * 100
                          : 0;
                      return (
                        <div key={cat.categoryName}>
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {cat.categoryColor && (
                                <span
                                  className="inline-block h-2.5 w-2.5 rounded-full"
                                  style={{
                                    backgroundColor: cat.categoryColor,
                                  }}
                                />
                              )}
                              <span className="text-sm font-medium text-foreground">
                                {cat.categoryName}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-muted-foreground">
                              {cat.courseCount} course
                              {cat.courseCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{
                                width: `${barWidth}%`,
                                backgroundColor:
                                  cat.categoryColor || "#14b8a6",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ---- Bottom Row ---- */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Recent Activity Feed */}
            <Card className="glass-card content-reveal-delay-3 content-reveal border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
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
            <Card className="glass-card content-reveal-delay-4 content-reveal border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
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
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

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
