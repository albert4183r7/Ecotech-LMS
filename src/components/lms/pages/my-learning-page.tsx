"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  Clock,
  CheckCircle,
  TrendingUp,
  Play,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCard } from "@/components/lms/course-card";
import { useMyLearningStore, useUserStore } from "@/stores/lms-store";
import { useNavigationStore } from "@/stores/lms-store";
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
  color,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  loading: boolean;
}) {
  return (
    <Card className="border-border/50">
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${color}`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          {loading ? (
            <Skeleton className="mb-1 h-6 w-8" />
          ) : (
            <p className="text-2xl font-bold leading-none text-foreground">
              {value}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
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
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
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
            <Play className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
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
            color="bg-cyan-600"
            loading={false}
          />
          <StatCard
            icon={Clock}
            label="In Progress"
            value={stats.inProgress}
            color="bg-blue-600"
            loading={false}
          />
          <StatCard
            icon={CheckCircle}
            label="Completed"
            value={stats.completed}
            color="bg-teal-600"
            loading={false}
          />
          <StatCard
            icon={TrendingUp}
            label="Avg Progress"
            value={`${stats.avgProgress}%` as unknown as number}
            color="bg-sky-600"
            loading={false}
          />
        </div>
      ) : null}

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        {/* Underline-style tab list */}
        <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger
            value="in-progress"
            className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            In Progress
            {!loadingEnrollments && inProgressList.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px]"
              >
                {inProgressList.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Completed
            {!loadingEnrollments && completedList.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px]"
              >
                {completedList.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="favorites"
            className="rounded-none border-b-2 border-transparent px-1 pb-3 pt-1 text-sm font-medium data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
          >
            Favorites
            {!loadingFavorites && favorites.length > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 h-5 min-w-5 px-1.5 text-[10px]"
              >
                {favorites.length}
              </Badge>
            )}
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
              description="Start learning by enrolling in a course from the catalog"
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
              title="No completed courses"
              description="Complete your enrolled courses to see them here"
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
              icon={BookOpen}
              title="No favorites yet"
              description="Click the heart icon on any course to save it to your favorites"
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
