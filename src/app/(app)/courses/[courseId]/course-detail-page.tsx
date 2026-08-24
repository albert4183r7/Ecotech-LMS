"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Star,
  Heart,
  Share2,
  BookOpen,
  Users,
  Calendar,
  ChevronLeft,
  AlertTriangle,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  PlayCircle,
  FileDown,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useUserStore, useCourseStore } from "@/stores/lms-store";
import { DeleteCourseDialog } from "@/components/lms/delete-course-dialog";
import { useNavigation } from "@/hooks/use-navigation";
import { DiscussionPanel } from "@/components/lms/discussion-panel";
import { ProgressTimeline } from "@/components/lms/progress-timeline";
import { StarRating } from "@/components/lms/star-rating";
import type { CourseItem, LessonItem, ClassroomState } from "@/types/lms";
import { buildClassroomState } from "@/lib/classroom";
import { safeFileName, triggerDownload } from "@/lib/download";
import { usePptxDownload } from "@/hooks/use-pptx-download";
import { lessonPreviewPath } from "@/lib/routes";
import { useRouter } from "next/navigation";

type LessonProgress = {
  lessonId: string;
  currentPage: number;
  completed: boolean;
};

type CourseDetailData = CourseItem & {
  isEnrolled: boolean;
  isFavorited: boolean;
  /** Decided server-side from the session, not from a client-supplied id. */
  isOwner?: boolean;
  enrollmentsCount?: number;
  favoritesCount?: number;
};

export function CourseDetailPage() {
  const { selectedCourseId, goBack, openClassroom, navigateTo } = useNavigation();
  const userId = useUserStore((s) => s.currentUserId);
  const currentRole = useUserStore((s) => s.currentRole);

  const [course, setCourse] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [lessonProgress, setLessonProgress] = useState<LessonProgress[]>([]);
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingCount, setRatingCount] = useState(0);
  const [downloadingPptx, setDownloadingPptx] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { setEditingCourseId } = useCourseStore();
  const router = useRouter();
  // One deck per lesson; the course-wide button below zips these same files.
  const { downloadingLessonId, downloadLesson } = usePptxDownload();

  /** Fetch course detail from API */
  const fetchCourse = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/courses/${selectedCourseId}`);
      const json = await res.json();
      // The server distinguishes a course that does not exist from one this
      // account may not see; both read as "Course not found" here, and its
      // message is more useful than a blanket "failed to load".
      if (!res.ok) throw new Error(json?.error || "Failed to load course");
      if (json.success) {
        setCourse(json.data);
      } else {
        throw new Error(json.error || "Unknown error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load course");
    } finally {
      setLoading(false);
    }
  }, [selectedCourseId, userId]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  /** Fetch rating data */
  const fetchRatingData = useCallback(async () => {
    if (!selectedCourseId) return;
    try {
      const res = await fetch(`/api/ratings?courseId=${encodeURIComponent(selectedCourseId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUserRating(json.data.userRating);
          setRatingCount(json.data.count);
          setCourse((prev) => (prev ? { ...prev, rating: json.data.average } : prev));
        }
      }
    } catch {
      // Best-effort
    }
  }, [selectedCourseId, userId]);

  useEffect(() => {
    fetchRatingData();
  }, [fetchRatingData]);

  /** Fetch lesson progress if enrolled */
  const fetchLessonProgress = useCallback(async () => {
    if (!userId || !course?.isEnrolled) return;
    try {
      const enrollRes = await fetch("/api/enrollments");
      const enrollJson = await enrollRes.json();
      if (enrollJson.success && Array.isArray(enrollJson.data)) {
        const enrollment = enrollJson.data.find(
          (e: Record<string, unknown>) => e.courseId === selectedCourseId,
        );
        if (enrollment) {
          const progRes = await fetch(`/api/progress?enrollmentId=${enrollment.id}`);
          const progJson = await progRes.json();
          if (progJson.success && Array.isArray(progJson.data)) {
            const mapped: LessonProgress[] = progJson.data.map((p: Record<string, unknown>) => ({
              lessonId: (p.lesson as Record<string, unknown>)?.id ?? p.lessonId,
              currentPage: (p.currentPage as number) || 0,
              completed: (p.completed as boolean) || false,
            }));
            setLessonProgress(mapped);
          }
        }
      }
    } catch {
      // Progress fetch is best-effort
    }
  }, [userId, course?.isEnrolled, selectedCourseId]);

  useEffect(() => {
    fetchLessonProgress();
  }, [fetchLessonProgress]);

  /** Handle enrollment */
  const handleEnroll = async () => {
    if (!selectedCourseId || enrolling) return;
    setEnrolling(true);
    try {
      const res = await fetch("/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, courseId: selectedCourseId }),
      });
      if (res.ok) {
        setCourse((prev) =>
          prev ? { ...prev, isEnrolled: true, studentCount: prev.studentCount + 1 } : prev,
        );
        toast.success("You're enrolled! Let's start learning.");
      } else {
        toast.error("Failed to enroll. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setEnrolling(false);
    }
  };

  /** Handle favorite toggle */
  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedCourseId || togglingFav) return;
    setTogglingFav(true);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, courseId: selectedCourseId }),
      });
      if (res.ok) {
        const json = await res.json();
        setCourse((prev) => (prev ? { ...prev, isFavorited: json.favorited } : prev));
      } else {
        toast.error("Failed to update favorite.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setTogglingFav(false);
    }
  };

  /**
   * Download the course as one PowerPoint file per lesson.
   *
   * The previous version flattened every lesson's slides into a single deck,
   * which lost the lesson boundaries entirely — a ten-lesson course arrived as
   * one long file with no indication of where each lesson began. Each lesson is
   * now built as its own .pptx; a course with more than one lesson is delivered
   * as a zip so the browser still only handles one download.
   */
  const handleDownloadCoursePptx = useCallback(async () => {
    if (!course || downloadingPptx) return;
    setDownloadingPptx(true);
    try {
      const decks: { name: string; blob: Blob }[] = [];

      for (const [index, lesson] of course.lessons.entries()) {
        const res = await fetch("/api/courses/export-pptx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId: lesson.id, deckName: lesson.title }),
        });
        // A lesson with nothing generated yet is skipped rather than failing
        // the whole download.
        if (!res.ok) continue;

        // Numbered so the lesson order survives an alphabetical file listing.
        const prefix = String(index + 1).padStart(2, "0");
        decks.push({
          name: `${prefix}-${safeFileName(lesson.title)}.pptx`,
          blob: await res.blob(),
        });
      }

      if (decks.length === 0) {
        toast.error("No content available for download.");
        return;
      }

      const courseName = safeFileName(course.title);
      if (decks.length === 1) {
        triggerDownload(decks[0].blob, decks[0].name);
      } else {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        for (const deck of decks) zip.file(deck.name, deck.blob);
        triggerDownload(await zip.generateAsync({ type: "blob" }), `${courseName}-lessons.zip`);
      }
      toast.success(
        decks.length === 1
          ? "Lesson PPT downloaded successfully!"
          : `Downloaded ${decks.length} lesson decks.`,
      );
    } catch {
      toast.error("Failed to download course PPT.");
    } finally {
      setDownloadingPptx(false);
    }
  }, [course, downloadingPptx]);

  /** Handle share button */
  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: course?.title, url: window.location.href });
      } catch {
        // User cancelled share
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  /** Handle lesson click → open classroom */
  const handleLessonClick = async (lesson: LessonItem) => {
    if (!course) return;
    try {
      const res = await fetch(`/api/lessons/${lesson.id}`);
      if (!res.ok) return;
      const json = await res.json();
      openClassroom(
        buildClassroomState({
          courseId: course.id,
          courseTitle: course.title,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          slides: json.success ? json.data.slides : [],
          allLessonIds: course.lessons.map((s) => s.id),
        }),
      );
    } catch {
      // Silently fail
    }
  };

  /** Render star rating */
  const renderStars = (rating: number) => {
    const stars: React.ReactElement[] = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`h-4 w-4 ${
            i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
          }`}
        />,
      );
    }
    return stars;
  };

  /** Generate gradient fallback for cover image */
  const getGradientStyle = (): React.CSSProperties => {
    const colors = [
      "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)",
      "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
      "linear-gradient(135deg, #059669 0%, #10b981 100%)",
      "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)",
      "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
      "linear-gradient(135deg, #0891b2 0%, #0d9488 100%)",
    ];
    const index = course ? course.title.charCodeAt(0) % colors.length : 0;
    return { background: colors[index] };
  };

  /** Format date */
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // ─── Loading Skeleton ─────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Hero skeleton (full-width banner) */}
        <Skeleton className="mb-6 aspect-[21/9] w-full rounded-2xl sm:aspect-[3/1]" />

        {/* Description skeleton */}
        <div className="mb-4 flex items-start gap-3">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>

        {/* Action bar skeleton */}
        <div className="mb-8 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="h-10 w-10 rounded-lg" />
          <Skeleton className="ml-auto h-12 w-44 rounded-lg" />
        </div>

        {/* Curriculum skeleton */}
        <Skeleton className="mb-4 h-6 w-32" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────
  if (error || !course) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="text-muted-foreground mb-4 text-lg">{error || "Course not found"}</p>
        <Button variant="outline" onClick={goBack}>
          <ChevronLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const totalLessons = course.lessons.length;
  const estimatedMinutes = Math.max(5, Math.round(totalLessons * 1.5));

  /** Get progress info for a lesson */
  const getLessonProgress = (lessonId: string) => {
    return lessonProgress.find((p) => p.lessonId === lessonId);
  };

  /** Get lesson status badge */
  const getLessonStatus = (lesson: LessonItem) => {
    if (!course.isEnrolled) return null;
    const prog = getLessonProgress(lesson.id);
    if (!prog) return "not-started";
    if (prog.completed) return "completed";
    return "in-progress";
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ─── Course Hero (Full-Width Image + Overlay) ── */}
      <div className="relative mb-6 aspect-[21/9] w-full overflow-hidden rounded-2xl sm:aspect-[3/1]">
        {/* Cover Image / Gradient Fallback */}
        <div className="absolute inset-0">
          {!imgError && course.coverImage ? (
            <img
              src={course.coverImage}
              alt={course.title}
              className="h-full w-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-full w-full" style={getGradientStyle()} />
          )}
        </div>

        {/* Gradient Overlay (bottom → transparent) */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        {/* Content overlayed on image */}
        <div className="relative flex h-full flex-col justify-end p-5 sm:p-8">
          {/* Breadcrumb overlayed on image */}
          <Breadcrumb className="mb-3 [&_ol]:flex-nowrap">
            <BreadcrumbList className="text-white/80">
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer text-white/80 transition-colors hover:text-white"
                  onClick={() => navigateTo("home")}
                >
                  Home
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="text-white/50" />
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer text-white/80 transition-colors hover:text-white"
                  onClick={() => navigateTo("courses")}
                >
                  All Courses
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="text-white/50" />
              <BreadcrumbItem>
                <BreadcrumbPage className="max-w-[180px] truncate font-medium text-white sm:max-w-[280px]">
                  {course.title}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Title on image */}
          <h1 className="mb-3 text-2xl leading-tight font-bold text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.3)] sm:text-3xl lg:text-4xl">
            {course.title}
          </h1>

          {/* Rating + Stats on image */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/90">
            {/* Rating with prominent number */}
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-bold text-white [text-shadow:0_1px_4px_rgba(0,0,0,0.3)] sm:text-2xl">
                {course.rating.toFixed(1)}
              </span>
              <div className="flex items-center gap-0.5">{renderStars(course.rating)}</div>
              {ratingCount > 0 && (
                <span className="ml-0.5 text-xs text-white/60">({ratingCount})</span>
              )}
            </div>

            <span className="h-4 w-px bg-white/30" />

            {/* Students count */}
            <span className="inline-flex items-center gap-1.5 [text-shadow:0_1px_4px_rgba(0,0,0,0.3)]">
              <Users className="h-4 w-4" />
              <span className="font-medium">{course.studentCount.toLocaleString()}</span>
              <span className="text-white/70">students</span>
            </span>

            <span className="h-4 w-px bg-white/30" />

            {/* Lesson count */}
            <span className="inline-flex items-center gap-1.5 [text-shadow:0_1px_4px_rgba(0,0,0,0.3)]">
              <BookOpen className="h-4 w-4" />
              <span className="font-medium">{totalLessons}</span>
              <span className="text-white/70">lessons</span>
            </span>

            <span className="h-4 w-px bg-white/30" />

            {/* Estimated duration */}
            <span className="inline-flex items-center gap-1.5 [text-shadow:0_1px_4px_rgba(0,0,0,0.3)]">
              <Clock className="h-4 w-4" />
              <span className="font-medium">~{estimatedMinutes} min</span>
              <span className="text-white/70">estimated</span>
            </span>

            {/* Updated date */}
            <span className="inline-flex items-center gap-1.5 text-white/70 [text-shadow:0_1px_4px_rgba(0,0,0,0.3)]">
              <Calendar className="h-4 w-4" />
              {formatDate(course.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Description + Language ─────────────────── */}
      <div className="mb-2 flex items-start gap-3">
        {course.language && (
          <Badge variant="secondary" className="mt-0.5 shrink-0">
            {course.language}
          </Badge>
        )}
        {course.description && (
          <p className="text-muted-foreground text-sm leading-relaxed">{course.description}</p>
        )}
      </div>

      {/* ─── Interactive Star Rating ─────────────── */}
      {userId && (
        <div className="mb-4">
          <StarRating
            courseId={course.id}
            userId={userId}
            currentRating={userRating}
            averageRating={course.rating}
            ratingCount={ratingCount}
            onRate={(data) => {
              setUserRating(data.score);
              setRatingCount(data.count);
              setCourse((prev) => (prev ? { ...prev, rating: data.average } : prev));
            }}
          />
        </div>
      )}

      {/* ─── Action Bar ──────────────────────────── */}
      <Separator className="my-4" />
      <div className="mb-8 flex flex-wrap items-center gap-3">
        {/* Grouped: Favorite + Share */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={handleToggleFavorite}
            disabled={togglingFav}
            aria-label={course.isFavorited ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart
              className={`h-4 w-4 transition-colors ${
                course.isFavorited ? "fill-red-500 text-red-500" : "text-muted-foreground"
              }`}
            />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10"
            onClick={handleShare}
            aria-label="Share course"
          >
            <Share2 className="text-muted-foreground h-4 w-4" />
          </Button>
        </div>

        {/* Every lesson also has its own download in the curriculum below;
            this is the same set of files, zipped. */}
        <Button
          variant="outline"
          size="lg"
          className="gap-2 px-5 py-6 text-sm font-medium"
          onClick={handleDownloadCoursePptx}
          disabled={downloadingPptx || course.lessons.length === 0}
          title="One .pptx per lesson, delivered as a single zip"
        >
          {downloadingPptx ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          {course.lessons.length > 1 ? "Download all lessons" : "Download as PPT"}
        </Button>

        {/* Start / Continue Learning Button - Prominent (students only) */}
        {currentRole === "student" ? (
          <Button
            size="lg"
            className={`ml-auto gap-2.5 px-8 py-6 text-base font-semibold ${
              course.isEnrolled
                ? "bg-primary hover:bg-primary/90 text-primary-foreground"
                : "from-primary to-accent text-primary-foreground pulse-glow bg-gradient-to-r hover:opacity-90"
            }`}
            onClick={
              course.isEnrolled
                ? () => {
                    if (course.lessons.length > 0) {
                      handleLessonClick(course.lessons[0]);
                    }
                  }
                : handleEnroll
            }
            disabled={enrolling}
          >
            {enrolling ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : course.isEnrolled ? (
              <PlayCircle className="h-5 w-5" />
            ) : (
              <BookOpen className="h-5 w-5" />
            )}
            {course.isEnrolled ? "Continue Learning" : "Start Learning"}
          </Button>
        ) : course.isOwner ? (
          /* The course's own instructor manages it from here. Both actions
             are re-checked server-side; this only decides what to offer. */
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              onClick={() => {
                setEditingCourseId(course.id);
                navigateTo("create-course");
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit Course
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-300">
            <BookOpen className="h-4 w-4" />
            Viewing as instructor. Switch to Student role to enroll.
          </div>
        )}
      </div>

      {/* ─── Curriculum Section ─────────────────────
          Each lesson is its own deck, so each lesson has its own download.
          A single course-wide button produced one bundle and left the reader
          to work out which file was which lesson. */}
      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-foreground text-xl font-bold">Curriculum</h2>
          {course.lessons.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Every lesson downloads as its own .pptx file.
            </p>
          )}
        </div>

        {course.lessons.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            No chapters available yet.
          </p>
        ) : (
          /* A list, not an accordion: the row opened the lesson rather than
             expanding, so the panel behind it was never reachable — and a
             per-lesson button cannot live inside a row that is itself one
             big button. */
          <div className="bg-card w-full divide-y overflow-hidden rounded-xl border">
            {course.lessons.map((lesson, index) => {
              const status = getLessonStatus(lesson);
              const prog = getLessonProgress(lesson.id);
              const completedPages = prog ? prog.currentPage : 0;
              const totalP = 1;
              const progressPct = totalP > 0 ? Math.round((completedPages / totalP) * 100) : 0;

              return (
                <div
                  key={lesson.id}
                  className="hover:bg-muted/50 flex flex-wrap items-center gap-3 px-4 py-4 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => handleLessonClick(lesson)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {/* Section Number - Gradient Circle */}
                    <span className="from-primary to-accent text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold shadow-sm">
                      {status === "completed" ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>

                    {/* Title, Page Count, Progress */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="text-foreground block truncate text-sm font-semibold">
                          {lesson.title}
                        </span>
                        {/* Status Badge */}
                        {status === "completed" && (
                          <Badge className="border-0 bg-emerald-500/10 px-1.5 py-0 text-[10px] text-emerald-600">
                            Completed
                          </Badge>
                        )}
                        {status === "in-progress" && (
                          <Badge className="border-0 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-600">
                            In Progress
                          </Badge>
                        )}
                        {status === "not-started" && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                            Not started
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground text-xs">{totalP} pages</span>
                        {/* Progress indicator if enrolled */}
                        {course.isEnrolled && status && status !== "not-started" && (
                          <span className="text-muted-foreground text-xs">
                            ✓ {completedPages}/{totalP} pages
                          </span>
                        )}
                        {course.isEnrolled && status === "not-started" && (
                          <span className="text-muted-foreground text-xs">0/{totalP} pages</span>
                        )}
                      </div>
                      {/* Mini progress bar if enrolled */}
                      {course.isEnrolled && <Progress value={progressPct} className="mt-1.5 h-1" />}
                    </div>
                  </button>

                  {/* Per-lesson actions */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {course.isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => router.push(lessonPreviewPath(lesson.id))}
                        title={`Preview and edit “${lesson.title}”`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Preview &amp; edit</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => downloadLesson(lesson, { position: index + 1 })}
                      disabled={downloadingLessonId !== null}
                      title={`Download “${lesson.title}” as a PowerPoint file`}
                    >
                      {downloadingLessonId === lesson.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileDown className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Download PPT</span>
                      <span className="sm:hidden">PPT</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Progress Timeline ──────────────────── */}
      {course.isEnrolled && (
        <section className="mt-8">
          <ProgressTimeline
            courseId={course.id}
            courseTitle={course.title}
            userId={userId}
            isEnrolled={course.isEnrolled}
            lessons={course.lessons}
            openClassroom={openClassroom}
            course={course}
          />
        </section>
      )}

      <section className="mt-8">
        <DiscussionPanel courseId={course.id} userId={userId} />
      </section>
      {/* ─── Browser Warning ─────────────────────── */}
      <div className="mt-8 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p>
          For the best learning experience, we recommend using the{" "}
          <span className="font-semibold">Google Chrome</span> browser.
        </p>
      </div>

      <DeleteCourseDialog
        course={confirmingDelete ? course : null}
        onOpenChange={(open) => !open && setConfirmingDelete(false)}
        onDeleted={() => navigateTo("dashboard")}
      />
    </main>
  );
}
