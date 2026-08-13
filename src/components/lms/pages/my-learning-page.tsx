"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  Clock,
  CheckCircle,
  TrendingUp,
  Play,
  Heart,
  ArrowRight,
  Sparkles,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCard } from "@/components/lms/course-card";
import { useMyLearningStore, useUserStore, useNavigationStore } from "@/stores/lms-store";
import type { LearningStats, MyLearningTab, CourseItem } from "@/types/lms";

/* ------------------------------------------------------------------ */
/*  Local types for API response shapes                               */
/* ------------------------------------------------------------------ */

interface EnrollmentCourse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  language: string;
  category: { id: string; name: string; color: string | null } | null;
  sectionsCount: number;
}

interface EnrollmentItem {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  progress: number;
  course: EnrollmentCourse;
}

interface FavoriteCourse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  studentCount: number;
  language: string;
  category: { id: string; name: string; color: string | null } | null;
  sectionsCount: number;
  enrollmentsCount: number;
}

interface FavoriteItem {
  id: string;
  createdAt: string;
  course: FavoriteCourse;
}

interface UserStats extends LearningStats {
  favoritesCount: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** Convert enrollment course data to CourseItem shape for CourseCard */
function enrollmentToCourseItem(e: EnrollmentItem): CourseItem {
  return {
    id: e.course.id,
    title: e.course.title,
    description: e.course.description,
    coverImage: e.course.coverImage,
    rating: e.course.rating,
    studentCount: 0,
    status: e.status,
    language: e.course.language,
    category: e.course.category,
    creator: null,
    sections: [],
    createdAt: e.enrolledAt,
    updatedAt: e.enrolledAt,
  };
}

/** Convert favorite course data to CourseItem shape for CourseCard */
function favoriteToCourseItem(f: FavoriteItem): CourseItem {
  return {
    id: f.course.id,
    title: f.course.title,
    description: f.course.description,
    coverImage: f.course.coverImage,
    rating: f.course.rating,
    studentCount: f.course.studentCount,
    status: "published",
    language: f.course.language,
    category: f.course.category,
    creator: null,
    sections: [],
    createdAt: f.createdAt,
    updatedAt: f.createdAt,
  };
}

/** Format date string to readable format */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                         */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  gradient,
  trend,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient: string;
  trend?: "up" | "down";
  loading: boolean;
}) {
  return (
    <Card className="overflow-hidden border-border/50 transition-shadow hover:shadow-md">
      <CardContent className="relative flex items-center gap-4 p-4">
        {/* Subtle gradient background */}
        <div
          className={`pointer-events-none absolute inset-0 opacity-[0.06] ${gradient}`}
        />
        <div
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${gradient} transition-transform duration-200 hover:scale-110`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="relative">
          {loading ? (
            <Skeleton className="mb-1 h-8 w-10" />
          ) : (
            <div className="flex items-baseline gap-1.5">
              <p className="text-3xl font-extrabold leading-none tracking-tight text-foreground">
                {value}
              </p>
              {trend && (
                <span
                  className={`text-sm font-semibold ${
                    trend === "up" ? "text-emerald-500" : "text-red-400"
                  }`}
                >
                  {trend === "up" ? "↑" : "↓"}
                </span>
              )}
            </div>
          )}
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Circular Mini Progress (for course rows)                           */
/* ------------------------------------------------------------------ */

function CircularMiniProgress({ percentage }: { percentage: number }) {
  const size = 40;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const circ = r * 2 * Math.PI;
  const offset = circ - (percentage / 100) * circ;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#mini-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
        <defs>
          <linearGradient id="mini-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-[9px] font-bold text-foreground">
        {percentage}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                       */
/* ------------------------------------------------------------------ */

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border/60 bg-gradient-to-b from-muted/20 to-transparent py-20 text-center">
      {/* Subtle background decoration */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03]">
        <div className="absolute left-1/4 top-1/4 h-40 w-40 rounded-full bg-gradient-to-br from-cyan-500 to-teal-400 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-32 w-32 rounded-full bg-gradient-to-tr from-amber-400 to-orange-300 blur-3xl" />
      </div>
      <div className="relative mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-muted to-muted/60 shadow-sm">
        <Icon className="h-10 w-10 text-muted-foreground/70" />
      </div>
      <h3 className="relative text-base font-semibold text-foreground">
        {title}
      </h3>
      <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  In-Progress Course Row                                             */
/* ------------------------------------------------------------------ */

function InProgressRow({
  enrollment,
}: {
  enrollment: EnrollmentItem;
}) {
  const { openCourseDetail } = useNavigationStore();

  return (
    <Card
      className="group cursor-pointer border-border/50 transition-all duration-200 hover:border-primary/20 hover:bg-muted/30 hover:shadow-md"
      onClick={() => openCourseDetail(enrollment.course.id)}
    >
      <CardContent className="flex items-center gap-4 p-4">
        {/* Cover Thumbnail */}
        <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg">
          {enrollment.course.coverImage ? (
            <img
              src={enrollment.course.coverImage}
              alt={enrollment.course.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-600 to-teal-500">
              <span className="text-lg font-bold text-white">
                {enrollment.course.title.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="truncate text-sm font-semibold text-foreground">
              {enrollment.course.title}
            </h4>
          </div>
          <div className="mt-1 flex items-center gap-2">
            {enrollment.course.category && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {enrollment.course.category.name}
              </Badge>
            )}
            <span className="text-[11px] text-muted-foreground">
              {enrollment.course.sectionsCount} sections
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-3">
            <Progress
              value={enrollment.progress}
              className="h-1.5 flex-1"
            />
            <span className="text-xs font-medium text-muted-foreground">
              {enrollment.progress}%
            </span>
          </div>
        </div>

        {/* Circular progress + Continue button */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <CircularMiniProgress percentage={enrollment.progress} />
          <span className="flex items-center gap-1 text-[11px] font-semibold text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            Continue <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Completed Course Row                                               */
/* ------------------------------------------------------------------ */

function CompletedRow({
  enrollment,
}: {
  enrollment: EnrollmentItem;
}) {
  const { openCourseDetail } = useNavigationStore();

  return (
    <Card
      className="group cursor-pointer border-border/50 transition-shadow hover:shadow-md"
      onClick={() => openCourseDetail(enrollment.course.id)}
    >
      <CardContent className="flex items-center gap-4 p-4">
        {/* Cover Thumbnail */}
        <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg">
          {enrollment.course.coverImage ? (
            <img
              src={enrollment.course.coverImage}
              alt={enrollment.course.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-500">
              <span className="text-lg font-bold text-white">
                {enrollment.course.title.charAt(0)}
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h4 className="truncate text-sm font-semibold text-foreground">
              {enrollment.course.title}
            </h4>
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            {enrollment.course.category && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0"
              >
                {enrollment.course.category.name}
              </Badge>
            )}
            {enrollment.completedAt && (
              <span className="text-[11px] text-muted-foreground">
                Completed {formatDate(enrollment.completedAt)}
              </span>
            )}
          </div>
          <Progress
            value={100}
            className="mt-2.5 h-1.5 flex-1 [&>div]:bg-emerald-500"
          />
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeletons                                                  */
/* ------------------------------------------------------------------ */

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="mb-1 h-6 w-8" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <Skeleton className="h-16 w-24 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="overflow-hidden border-border/50">
          <Skeleton className="aspect-video w-full" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Continue Learning Widget                                           */
/* ------------------------------------------------------------------ */

function ContinueLearningWidget({
  enrollment,
}: {
  enrollment: EnrollmentItem | null | undefined;
}) {
  const { openCourseDetail, navigateTo } = useNavigationStore();

  /* Loading state */
  if (enrollment === undefined) {
    return (
      <Card className="overflow-hidden border-border/50">
        <CardContent className="flex items-center gap-4 p-4">
          <Skeleton className="h-28 w-full sm:h-32 sm:w-52 rounded-xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-10 w-40 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  /* Empty state - no in-progress courses */
  if (!enrollment) {
    return (
      <Card className="overflow-hidden border-border/50 bg-gradient-to-r from-muted/40 via-muted/20 to-muted/40">
        <CardContent className="relative flex flex-col items-center justify-center gap-3 px-6 py-10 text-center sm:flex-row sm:text-left">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10">
            <GraduationCap className="h-7 w-7 text-primary" />
          </div>
          <div className="relative flex-1">
            <h3 className="text-base font-semibold text-foreground">
              Ready to start learning?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse our course catalog and enroll in a course to track your progress here.
            </p>
          </div>
          <Button
            variant="outline"
            className="relative shrink-0 gap-2 font-semibold"
            onClick={() => navigateTo("courses")}
          >
            <Sparkles className="h-4 w-4" />
            Browse Courses
          </Button>
        </CardContent>
      </Card>
    );
  }

  /* Active course - show continue learning card */
  const { course, progress, enrolledAt } = enrollment;

  return (
    <Card className="group overflow-hidden border-border/50 transition-shadow hover:shadow-lg">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Cover Banner */}
          <div className="relative h-36 w-full shrink-0 overflow-hidden sm:h-auto sm:w-56 sm:min-h-[180px]">
            {course.coverImage ? (
              <img
                src={course.coverImage}
                alt={course.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-600 via-teal-500 to-emerald-500">
                <BookOpen className="h-12 w-12 text-white/40" />
              </div>
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent sm:bg-gradient-to-r sm:from-transparent sm:to-card" />
          </div>

          {/* Content */}
          <div className="relative flex flex-1 flex-col justify-center gap-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                Continue Learning
              </span>
              {course.category && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {course.category.name}
                </Badge>
              )}
            </div>

            <h3 className="text-lg font-bold leading-snug text-foreground sm:text-xl">
              {course.title}
            </h3>

            <p className="text-xs text-muted-foreground">
              {course.sectionsCount} sections - Enrolled {formatDate(enrolledAt)}
            </p>

            <div className="flex items-center gap-3">
              <Progress value={progress} className="h-2 flex-1" />
              <span className="text-sm font-bold tabular-nums text-foreground">
                {progress}%
              </span>
            </div>

            <Button
              className="w-fit gap-2 bg-gradient-to-r from-primary to-accent font-semibold text-primary-foreground shadow-md transition-all hover:shadow-lg hover:opacity-90"
              onClick={() => openCourseDetail(course.id)}
            >
              <Play className="h-4 w-4" />
              Continue Learning
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


/* ------------------------------------------------------------------ */
/*  Main My Learning Page                                              */
/* ------------------------------------------------------------------ */

export function MyLearningPage() {
  const { tab, setTab, setEnrollments, setFavorites } = useMyLearningStore();
  const { currentUserId } = useUserStore();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [enrollments, setEnrollmentsState] = useState<EnrollmentItem[]>([]);
  const [favorites, setFavoritesState] = useState<FavoriteItem[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingEnrollments, setLoadingEnrollments] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/user/${currentUserId}`);
      const json = await res.json();
      if (json.success) {
        setStats(json.data.stats);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingStats(false);
    }
  }, [currentUserId]);

  const fetchEnrollments = useCallback(async () => {
    setLoadingEnrollments(true);
    try {
      const res = await fetch(
        `/api/enrollments?userId=${currentUserId}`
      );
      const json = await res.json();
      if (json.success) {
        setEnrollmentsState(json.data);
        setEnrollments(
          json.data.map((e: EnrollmentItem) => enrollmentToCourseItem(e))
        );
      }
    } catch {
      /* silent */
    } finally {
      setLoadingEnrollments(false);
    }
  }, [currentUserId, setEnrollments]);

  const fetchFavorites = useCallback(async () => {
    setLoadingFavorites(true);
    try {
      const res = await fetch(
        `/api/favorites?userId=${currentUserId}`
      );
      const json = await res.json();
      if (json.success) {
        setFavoritesState(json.data);
        setFavorites(
          json.data.map((f: FavoriteItem) => favoriteToCourseItem(f))
        );
      }
    } catch {
      /* silent */
    } finally {
      setLoadingFavorites(false);
    }
  }, [currentUserId, setFavorites]);

  useEffect(() => {
    fetchStats();
    fetchEnrollments();
    fetchFavorites();
  }, [fetchStats, fetchEnrollments, fetchFavorites]);

  /* Derived lists */
  const inProgressList = enrollments.filter(
    (e) => e.status === "in_progress"
  );
  const completedList = enrollments.filter(
    (e) => e.status === "completed"
  );

  /* Tab change handler */
  const handleTabChange = (value: string) => {
    setTab(value as MyLearningTab);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Learning</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track your learning progress and manage your courses
        </p>
      </div>

      {/* Stats Row */}
      {loadingStats ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={BookOpen}
            label="Total Courses"
            value={stats.totalCourses}
            gradient="bg-gradient-to-br from-blue-500 to-blue-700"
            trend="up"
            loading={false}
          />
          <StatCard
            icon={Clock}
            label="In Progress"
            value={stats.inProgress}
            gradient="bg-gradient-to-br from-teal-500 to-teal-700"
            loading={false}
          />
          <StatCard
            icon={CheckCircle}
            label="Completed"
            value={stats.completed}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
            trend="up"
            loading={false}
          />
          <StatCard
            icon={TrendingUp}
            label="Avg Progress"
            value={`${stats.avgProgress}%`}
            gradient="bg-gradient-to-br from-amber-500 to-amber-700"
            trend="up"
            loading={false}
          />
        </div>
      ) : null}

      {/* Continue Learning Widget */}
      <ContinueLearningWidget
        enrollment={
          loadingEnrollments
            ? undefined
            : inProgressList.length > 0
              ? inProgressList[0]
              : null
        }
      />

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        {/* Underline-style tab list with animated indicator */}
        <TabsList className="relative h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="in-progress"
            className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-medium text-muted-foreground transition-all duration-300 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              In Progress
              {!loadingEnrollments && inProgressList.length > 0 && (
                <Badge className="ml-0.5 h-5 min-w-5 rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                  {inProgressList.length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-medium text-muted-foreground transition-all duration-300 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              Completed
              {!loadingEnrollments && completedList.length > 0 && (
                <Badge className="ml-0.5 h-5 min-w-5 rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                  {completedList.length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="favorites"
            className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-medium text-muted-foreground transition-all duration-300 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:text-foreground"
          >
            <span className="flex items-center gap-1.5">
              Favorites
              {!loadingFavorites && favorites.length > 0 && (
                <Badge className="ml-0.5 h-5 min-w-5 rounded-full bg-primary/10 px-1.5 text-[10px] font-bold text-primary">
                  {favorites.length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* In Progress Tab */}
        <TabsContent value="in-progress" className="mt-6">
          {loadingEnrollments ? (
            <ListSkeleton />
          ) : inProgressList.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No courses in progress"
              description="Browse our course catalog and enroll in courses that interest you. Your active courses will appear here with progress tracking."
            />
          ) : (
            <div className="space-y-3">
              {inProgressList.map((enrollment) => (
                <InProgressRow
                  key={enrollment.id}
                  enrollment={enrollment}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Completed Tab */}
        <TabsContent value="completed" className="mt-6">
          {loadingEnrollments ? (
            <ListSkeleton />
          ) : completedList.length === 0 ? (
            <EmptyState
              icon={CheckCircle}
              title="No completed courses yet"
              description="Keep learning! Once you finish all sections of an enrolled course, it will be moved here to celebrate your achievement."
            />
          ) : (
            <div className="space-y-3">
              {completedList.map((enrollment) => (
                <CompletedRow
                  key={enrollment.id}
                  enrollment={enrollment}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Favorites Tab */}
        <TabsContent value="favorites" className="mt-6">
          {loadingFavorites ? (
            <GridSkeleton />
          ) : favorites.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No favorites yet"
              description="Click the heart icon on any course to save it to your favorites. You can quickly access them from here anytime."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {favorites.map((favorite) => (
                <CourseCard
                  key={favorite.id}
                  course={favoriteToCourseItem(favorite)}
                  showFavorite
                  isFavorited
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
