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
  Star,
  Trophy,
  Download,
  User,
  Flame,
  Award,
  MessageSquare,
  Trash2,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { CourseCard } from "@/components/lms/course-card";
import { useMyLearningStore, useUserStore } from "@/stores/lms-store";
import { useNavigation } from "@/hooks/use-navigation";
import type { LearningStats, MyLearningTab, CourseItem } from "@/types/lms";
import {
  CourseProgressCard,
  CompletedCourseCard,
  FavoritesCard,
  EnrollmentCourse,
  EnrollmentItem,
  FavoriteCourse,
  FavoriteItem,
  estimateRemainingTime,
  formatDate,
  formatLastAccessed,
} from "@/components/lms/my-learning/course-cards";
import { StatsDashboardCard, CircularMiniProgress } from "@/components/lms/my-learning/stats";
import {
  EnhancedEmptyState,
  StatsSkeleton,
  ListSkeleton,
  GridSkeleton,
} from "@/components/lms/my-learning/placeholders";

/* ------------------------------------------------------------------ */
/*  Local types for API response shapes                               */
/* ------------------------------------------------------------------ */

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
    lessons: [],
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
    lessons: [],
    createdAt: f.createdAt,
    updatedAt: f.createdAt,
  };
}

/** Format date string to readable format */
function ContinueLearningWidget({ enrollment }: { enrollment: EnrollmentItem | null | undefined }) {
  const { openCourseDetail, navigateTo } = useNavigation();

  /* Loading state */
  if (enrollment === undefined) {
    return (
      <Card className="border-border/50 overflow-hidden">
        <CardContent className="flex items-center gap-4 p-4">
          <Skeleton className="h-28 w-full rounded-xl sm:h-32 sm:w-52" />
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
      <Card className="border-border/50 from-muted/40 via-muted/20 to-muted/40 overflow-hidden bg-gradient-to-r">
        <CardContent className="relative flex flex-col items-center justify-center gap-3 px-6 py-10 text-center sm:flex-row sm:text-left">
          <div className="from-primary/10 to-accent/10 relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br">
            <GraduationCap className="text-primary h-7 w-7" />
          </div>
          <div className="relative flex-1">
            <h3 className="text-foreground text-base font-semibold">Ready to start learning?</h3>
            <p className="text-muted-foreground mt-1 text-sm">
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
    <Card className="group border-border/50 overflow-hidden transition-shadow hover:shadow-lg">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Cover Banner */}
          <div className="relative h-36 w-full shrink-0 overflow-hidden sm:h-auto sm:min-h-[180px] sm:w-56">
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
            <div className="sm:to-card absolute inset-0 bg-gradient-to-t from-black/50 to-transparent sm:bg-gradient-to-r sm:from-transparent" />
          </div>

          {/* Content */}
          <div className="relative flex flex-1 flex-col justify-center gap-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <span className="bg-primary/10 text-primary rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                Continue Learning
              </span>
              {course.category && (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {course.category.name}
                </Badge>
              )}
            </div>

            <h3 className="text-foreground text-lg leading-snug font-bold sm:text-xl">
              {course.title}
            </h3>

            <p className="text-muted-foreground text-xs">
              {course.lessonsCount} lessons - Enrolled {formatDate(enrolledAt)}
            </p>

            <div className="flex items-center gap-3">
              <Progress value={progress} className="h-2 flex-1" />
              <span className="text-foreground text-sm font-bold tabular-nums">{progress}%</span>
            </div>

            <Button
              className="from-primary to-accent text-primary-foreground w-fit gap-2 bg-gradient-to-r font-semibold shadow-md transition-all hover:opacity-90 hover:shadow-lg"
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
  const { navigateTo } = useNavigation();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [enrollments, setEnrollmentsState] = useState<EnrollmentItem[]>([]);
  const [favorites, setFavoritesState] = useState<FavoriteItem[]>([]);
  const [userName, setUserName] = useState<string>("");
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingEnrollments, setLoadingEnrollments] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [leaving, setLeaving] = useState<EnrollmentItem | null>(null);
  const [leavePending, setLeavePending] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/users/${currentUserId}`);
      const json = await res.json();
      if (json.success) {
        setStats(json.data.stats);
        if (json.data.name) setUserName(json.data.name);
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
      const res = await fetch("/api/enrollments");
      const json = await res.json();
      if (json.success) {
        setEnrollmentsState(json.data);
        setEnrollments(json.data.map((e: EnrollmentItem) => enrollmentToCourseItem(e)));
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
      const res = await fetch("/api/favorites");
      const json = await res.json();
      if (json.success) {
        setFavoritesState(json.data);
        setFavorites(json.data.map((f: FavoriteItem) => favoriteToCourseItem(f)));
      }
    } catch {
      /* silent */
    } finally {
      setLoadingFavorites(false);
    }
  }, [currentUserId, setFavorites]);

  const handleRemoveFavorite = useCallback(
    async (favoriteId: string) => {
      try {
        // Find the course ID for this favorite
        const fav = favorites.find((f) => f.id === favoriteId);
        if (!fav) return;

        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, courseId: fav.course.id }),
        });
        const json = await res.json();
        if (json.success) {
          // Refresh favorites
          fetchFavorites();
        }
      } catch {
        /* silent */
      }
    },
    [currentUserId, favorites, fetchFavorites],
  );

  const handleLeaveCourse = useCallback(async () => {
    if (!leaving || leavePending) return;
    setLeavePending(true);
    try {
      const res = await fetch(`/api/enrollments/${leaving.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dropped" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not leave course");
      setEnrollmentsState((current) => current.filter((item) => item.id !== leaving.id));
      setEnrollments(
        enrollments
          .filter((item) => item.id !== leaving.id)
          .map((item) => enrollmentToCourseItem(item)),
      );
      toast.success(`Left ${leaving.course.title}. You can rejoin from the course catalog.`);
      setLeaving(null);
      void fetchStats();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Could not leave course");
    } finally {
      setLeavePending(false);
    }
  }, [enrollments, fetchStats, leavePending, leaving, setEnrollments]);

  useEffect(() => {
    fetchStats();
    fetchEnrollments();
    fetchFavorites();
  }, [fetchStats, fetchEnrollments, fetchFavorites]);

  /* Derived lists */
  const inProgressList = enrollments.filter((e) => e.status === "in_progress");
  const completedList = enrollments.filter((e) => e.status === "completed");

  /* Calculate derived stats */
  const totalLearningHours =
    enrollments.length > 0
      ? Math.round(
          enrollments.reduce((acc, e) => {
            const completedLessons = Math.round((e.progress / 100) * e.course.lessonsCount);
            return acc + completedLessons * 0.5; // ~30 min per lesson
          }, 0) * 10,
        ) / 10
      : 0;

  const completedThisMonth = completedList.filter((e) => {
    if (!e.completedAt) return false;
    const now = new Date();
    const completedDate = new Date(e.completedAt);
    return (
      completedDate.getMonth() === now.getMonth() &&
      completedDate.getFullYear() === now.getFullYear()
    );
  }).length;

  const currentStreak =
    enrollments.length > 0
      ? Math.min(
          Math.max(1, Math.floor(inProgressList.reduce((acc, e) => acc + e.progress, 0) / 50)),
          30,
        )
      : 0;

  const avgCompletionRate = stats?.avgProgress ?? 0;

  /* Check which favorite courses are enrolled */
  const enrolledCourseIds = new Set(enrollments.map((e) => e.course.id));

  /* Tab change handler */
  const handleTabChange = (value: string) => {
    setTab(value as MyLearningTab);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-foreground text-2xl font-bold">My Learning</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track your learning progress and manage your courses
        </p>
      </div>

      {/* Enhanced Stats Dashboard */}
      {loadingStats ? (
        <StatsSkeleton />
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatsDashboardCard
            icon={Clock}
            label="Total Learning Hours"
            value={`${totalLearningHours}h`}
            gradient="bg-gradient-to-br from-blue-500 to-blue-700"
            sub={"All time"}
            loading={false}
          />
          <StatsDashboardCard
            icon={Award}
            label="Completed This Month"
            value={completedThisMonth}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
            sub={completedThisMonth > 0 ? "Great work!" : undefined}
            loading={false}
          />
          <StatsDashboardCard
            icon={Flame}
            label="Current Streak"
            value={`${currentStreak} days`}
            gradient="bg-gradient-to-br from-amber-500 to-orange-600"
            sub={currentStreak >= 7 ? "On fire!" : currentStreak >= 3 ? "Keep going!" : undefined}
            loading={false}
          />
          <StatsDashboardCard
            icon={TrendingUp}
            label="Avg Completion Rate"
            value={`${avgCompletionRate}%`}
            gradient="bg-gradient-to-br from-purple-500 to-purple-700"
            sub={avgCompletionRate >= 75 ? "Excellent!" : undefined}
            loading={false}
          />
        </div>
      ) : null}

      {/* Continue Learning Widget */}
      <ContinueLearningWidget
        enrollment={
          loadingEnrollments ? undefined : inProgressList.length > 0 ? inProgressList[0] : null
        }
      />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
        {/* Underline-style tab list with animated indicator */}
        <TabsList className="border-border relative h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="in-progress"
            className="text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none border-b-2 border-transparent px-1 pt-1 pb-3 text-sm font-medium transition-all duration-300 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none"
          >
            <span className="flex items-center gap-1.5">
              In Progress
              {!loadingEnrollments && inProgressList.length > 0 && (
                <Badge className="bg-primary/10 text-primary ml-0.5 h-5 min-w-5 rounded-full px-1.5 text-[10px] font-bold">
                  {inProgressList.length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="completed"
            className="text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none border-b-2 border-transparent px-1 pt-1 pb-3 text-sm font-medium transition-all duration-300 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none"
          >
            <span className="flex items-center gap-1.5">
              Completed
              {!loadingEnrollments && completedList.length > 0 && (
                <Badge className="bg-primary/10 text-primary ml-0.5 h-5 min-w-5 rounded-full px-1.5 text-[10px] font-bold">
                  {completedList.length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="favorites"
            className="text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none border-b-2 border-transparent px-1 pt-1 pb-3 text-sm font-medium transition-all duration-300 data-[state=active]:bg-transparent data-[state=active]:font-semibold data-[state=active]:shadow-none"
          >
            <span className="flex items-center gap-1.5">
              Favorites
              {!loadingFavorites && favorites.length > 0 && (
                <Badge className="bg-primary/10 text-primary ml-0.5 h-5 min-w-5 rounded-full px-1.5 text-[10px] font-bold">
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
            <EnhancedEmptyState type="in-progress" onAction={() => navigateTo("courses")} />
          ) : (
            <div className="space-y-4">
              {inProgressList.map((enrollment) => (
                <CourseProgressCard
                  key={enrollment.id}
                  enrollment={enrollment}
                  onLeave={setLeaving}
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
            <EnhancedEmptyState type="completed" onAction={() => navigateTo("courses")} />
          ) : (
            <div className="space-y-4">
              {completedList.map((enrollment) => (
                <CompletedCourseCard
                  key={enrollment.id}
                  enrollment={enrollment}
                  userName={userName || "Learner"}
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
            <EnhancedEmptyState type="favorites" onAction={() => navigateTo("courses")} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {favorites.map((favorite) => (
                <FavoritesCard
                  key={favorite.id}
                  favorite={favorite}
                  isEnrolled={enrolledCourseIds.has(favorite.course.id)}
                  onRemove={() => handleRemoveFavorite(favorite.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={Boolean(leaving)} onOpenChange={(open) => !open && setLeaving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave this course?</AlertDialogTitle>
            <AlertDialogDescription>
              {leaving
                ? `“${leaving.course.title}” will be removed from My Learning. Your progress and quiz history will be kept if you rejoin later.`
                : "Your saved progress will be kept."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={leavePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={leavePending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleLeaveCourse();
              }}
            >
              {leavePending ? "Leaving…" : "Leave course"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
