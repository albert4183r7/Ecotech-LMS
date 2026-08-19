"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  BookOpen,
  Star,
  Users,
  GraduationCap,
  BarChart3,
  ArrowUpRight,
  Pencil,
  Plus,
  Compass,
  UserPlus,
  Eye,
  Clock,
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
import { useUserStore, useNavigationStore, useCourseStore } from "@/stores/lms-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InstructorCourse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  studentCount: number;
  status: string;
  language: string;
  category: { id: string; name: string; color: string | null } | null;
  lessonsCount: number;
  enrollmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

interface StudentActivity {
  id: string;
  studentName: string;
  studentAvatar: string | null;
  courseTitle: string;
  enrolledAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffWeek < 5) return `${diffWeek}w ago`;
  return `${diffMonth}mo ago`;
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
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const isPublished = status === "published";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-[10px] font-semibold uppercase tracking-wider",
        isPublished
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      )}
    >
      {isPublished ? "Published" : "Draft"}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard Page                                                     */
/* ------------------------------------------------------------------ */

export function DashboardPage() {
  const { currentUserId } = useUserStore();
  const { openCourseDetail, navigateTo } = useNavigationStore();
  const { setEditingCourseId } = useCourseStore();
  const [courses, setCourses] = useState<InstructorCourse[] | null>(null);
  const [activities, setActivities] = useState<StudentActivity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [coursesRes, activitiesRes] = await Promise.all([
        fetch(`/api/courses?creatorId=${currentUserId}`),
        fetch(`/api/enrollments?creatorId=${currentUserId}`),
      ]);

      const coursesJson = await coursesRes.json();
      const activitiesJson = await activitiesRes.json();

      if (coursesJson.success) {
        setCourses(coursesJson.data);
      } else {
        setError(coursesJson.error || "Failed to load courses");
        return;
      }

      if (activitiesJson.success) {
        setActivities(activitiesJson.data);
      } else {
        setActivities([]);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  /* ---- Computed stats ---- */
  const stats = useMemo(() => {
    if (!courses) return { totalCourses: 0, totalStudents: 0, avgRating: "0.0", totalLessons: 0 };
    const totalCourses = courses.length;
    const totalStudents = courses.reduce((sum, c) => sum + (c.studentCount || 0), 0);
    const ratedCourses = courses.filter((c) => c.rating > 0);
    const avgRating =
      ratedCourses.length > 0
        ? (ratedCourses.reduce((sum, c) => sum + c.rating, 0) / ratedCourses.length).toFixed(1)
        : "0.0";
    const totalLessons = courses.reduce((sum, c) => sum + (c.lessonsCount || 0), 0);
    return { totalCourses, totalStudents, avgRating, totalLessons };
  }, [courses]);

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
              Instructor Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Manage your courses and track student engagement
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <DashboardSkeleton />
      ) : courses ? (
        <div className="space-y-6">
          {/* ---- Top Stats Row ---- */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              icon={<BookOpen className="h-5 w-5 text-white" />}
              label="Total Courses"
              value={stats.totalCourses}
              gradient="from-teal-500 to-cyan-600"
              gradientFrom="from-teal-400"
              gradientTo="to-cyan-300"
              delay={0}
              seed={101}
            />
            <StatCard
              icon={<Users className="h-5 w-5 text-white" />}
              label="Total Students"
              value={stats.totalStudents}
              gradient="from-amber-500 to-orange-500"
              gradientFrom="from-amber-400"
              gradientTo="to-orange-300"
              delay={50}
              seed={202}
            />
            <StatCard
              icon={<Star className="h-5 w-5 text-white" />}
              label="Average Rating"
              value={stats.avgRating}
              gradient="from-emerald-500 to-green-600"
              gradientFrom="from-emerald-400"
              gradientTo="to-green-300"
              delay={100}
              seed={303}
            />
            <StatCard
              icon={<GraduationCap className="h-5 w-5 text-white" />}
              label="Total Lessons"
              value={stats.totalLessons}
              gradient="from-rose-500 to-pink-600"
              gradientFrom="from-rose-400"
              gradientTo="to-pink-300"
              delay={150}
              seed={404}
            />
          </div>

          {/* ---- Quick Actions ---- */}
          <div className="content-reveal-delay-1 content-reveal flex flex-wrap gap-3">
            <Button
              onClick={() => navigateTo("create-course")}
              className="gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 text-white hover:from-teal-600 hover:to-emerald-700 shadow-md transition-all hover:shadow-lg"
            >
              <Plus className="h-4 w-4" />
              Create New Course
            </Button>
            <Button
              variant="outline"
              onClick={() => navigateTo("courses")}
              className="gap-2 hover:bg-muted/80 transition-colors"
            >
              <Compass className="h-4 w-4" />
              Browse All Courses
            </Button>
          </div>

          {/* ---- My Courses Table ---- */}
          <Card className="glass-card content-reveal-delay-2 content-reveal hover-lift border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base gradient-text">
                <BookOpen className="h-4 w-4 text-teal-500" />
                My Courses
              </CardTitle>
            </CardHeader>
            <CardContent>
              {courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <BookOpen className="h-8 w-8 text-muted-foreground/30" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    You haven&apos;t created any courses yet
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-2"
                    onClick={() => navigateTo("create-course")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create Your First Course
                  </Button>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                  {/* Desktop table header */}
                  <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-4 sm:items-center sm:px-3 sm:py-2 sm:text-[11px] sm:font-semibold sm:uppercase sm:tracking-wider sm:text-muted-foreground border-b border-border/50 mb-2">
                    <span>Course</span>
                    <span className="text-center">Students</span>
                    <span className="text-center">Rating</span>
                    <span className="text-center">Status</span>
                    <span className="text-center w-16">Action</span>
                  </div>
                  <div className="space-y-1">
                    {courses.map((course) => (
                      <div
                        key={course.id}
                        className="group flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-4 sm:items-center rounded-xl p-3 transition-colors hover:bg-muted/50"
                      >
                        {/* Course title + category */}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {course.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            {course.category && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] font-semibold"
                                style={
                                  course.category.color
                                    ? {
                                        backgroundColor: `${course.category.color}20`,
                                        color: course.category.color,
                                        borderColor: `${course.category.color}40`,
                                      }
                                    : undefined
                                }
                              >
                                {course.category.name}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {course.lessonsCount} lesson{course.lessonsCount !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </div>

                        {/* Students enrolled */}
                        <div className="flex items-center gap-1.5 mt-2 sm:mt-0 sm:justify-center sm:min-w-[70px]">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">
                            {course.studentCount}
                          </span>
                        </div>

                        {/* Rating */}
                        <div className="mt-2 sm:mt-0 sm:justify-center sm:min-w-[90px]">
                          <StarRating rating={course.rating} />
                        </div>

                        {/* Status */}
                        <div className="mt-2 sm:mt-0 sm:justify-center">
                          <StatusBadge status={course.status} />
                        </div>

                        {/* Action buttons */}
                        <div className="mt-2 sm:mt-0 sm:justify-center flex items-center gap-1">
                          {course.status === "draft" ? (
                            <>
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                                      onClick={() => {
                                        setEditingCourseId(course.id);
                                        navigateTo("create-course");
                                      }}
                                    >
                                      <Compass className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit Draft</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="h-8 gap-1 px-2 opacity-0 transition-opacity group-hover:opacity-100 text-xs"
                                      onClick={async () => {
                                        try {
                                          await fetch(`/api/courses/${course.id}`, {
                                            method: "PUT",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ status: "published" }),
                                          });
                                          window.location.reload();
                                        } catch { /* silent */ }
                                      }}
                                    >
                                      <ArrowUpRight className="h-3.5 w-3.5" />
                                      Publish
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Publish Course</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </>
                          ) : (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                                    onClick={() => openCourseDetail(course.id)}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View Course</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ---- Bottom Row ---- */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Recent Student Activity */}
            <Card className="glass-card content-reveal-delay-3 content-reveal hover-lift border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base gradient-text">
                  <UserPlus className="h-4 w-4 text-emerald-500" />
                  Recent Student Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!activities || activities.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No student enrollments yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/70">
                      Enrollments will appear here once students join your courses
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                    {activities.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-muted/50"
                      >
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-100 to-emerald-100 dark:from-teal-950 dark:to-emerald-950">
                          <UserPlus className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground">
                            <span className="font-medium">
                              {activity.studentName}
                            </span>{" "}
                            enrolled in{" "}
                            <span className="font-medium text-teal-600 dark:text-teal-400">
                              {activity.courseTitle}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {timeAgo(activity.enrolledAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats Summary */}
            <Card className="glass-card content-reveal-delay-4 content-reveal hover-lift border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base gradient-text">
                  <GraduationCap className="h-4 w-4 text-amber-500" />
                  Course Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                {courses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <GraduationCap className="h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      No course data yet
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                    {/* Published vs Draft breakdown */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-xl border border-border/50 p-3 text-center">
                        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                          {courses.filter((c) => c.status === "published").length}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Published</p>
                      </div>
                      <div className="rounded-xl border border-border/50 p-3 text-center">
                        <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                          {courses.filter((c) => c.status === "draft").length}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">Drafts</p>
                      </div>
                    </div>

                    {/* Top courses by students */}
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Most Popular
                    </p>
                    {courses
                      .sort((a, b) => (b.studentCount || 0) - (a.studentCount || 0))
                      .slice(0, 5)
                      .map((course, index) => (
                        <button
                          key={course.id}
                          onClick={() => openCourseDetail(course.id)}
                          className="group flex w-full items-center gap-3 rounded-xl border border-border/50 p-3 text-left transition-all hover:border-primary/30 hover:shadow-sm"
                        >
                          <div
                            className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white",
                              index === 0
                                ? "bg-gradient-to-br from-amber-400 to-yellow-500"
                                : index === 1
                                  ? "bg-gradient-to-br from-slate-300 to-slate-400"
                                  : index === 2
                                    ? "bg-gradient-to-br from-amber-600 to-orange-600"
                                    : "bg-gradient-to-br from-muted-foreground/30 to-muted-foreground/20"
                            )}
                          >
                            {index + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              {course.title}
                            </p>
                            <div className="mt-1 flex items-center gap-3">
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="h-3 w-3" />
                                {course.studentCount} students
                              </span>
                              <StarRating rating={course.rating} />
                            </div>
                          </div>
                          {course.category && (
                            <Badge
                              variant="secondary"
                              className="shrink-0 text-[10px]"
                              style={
                                course.category.color
                                  ? {
                                      backgroundColor: `${course.category.color}20`,
                                      color: course.category.color,
                                      borderColor: `${course.category.color}40`,
                                    }
                                  : undefined
                              }
                            >
                              {course.category.name}
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

      {/* Quick actions skeleton */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-44 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
      </div>

      {/* My Courses table skeleton */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-28" />
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Table header skeleton */}
          <div className="hidden sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-4 sm:items-center sm:px-3 sm:py-2 border-b border-border/50">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col sm:grid sm:grid-cols-[1fr_auto_auto_auto_auto] sm:gap-4 sm:items-center sm:px-3 sm:py-3"
            >
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Bottom row skeleton */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent activity skeleton */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-44" />
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

        {/* Course overview skeleton */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
            <Skeleton className="h-3 w-28" />
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
