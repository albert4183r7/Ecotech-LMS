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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import type { CourseItem, SectionItem, ClassroomState, SlideContent } from "@/types/lms";

type CourseDetailData = CourseItem & {
  isEnrolled: boolean;
  isFavorited: boolean;
  enrollmentsCount?: number;
  favoritesCount?: number;
};

export function CourseDetailPage() {
  const { selectedCourseId, goBack, openClassroom, navigateTo } =
    useNavigationStore();
  const userId = useUserStore((s) => s.currentUserId);

  const [course, setCourse] = useState<CourseDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [togglingFav, setTogglingFav] = useState(false);
  const [imgError, setImgError] = useState(false);

  /** Fetch course detail from API */
  const fetchCourse = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/courses/${selectedCourseId}?userId=${userId}`
      );
      if (!res.ok) throw new Error("Failed to load course");
      const json = await res.json();
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
        setCourse((prev) => (prev ? { ...prev, isEnrolled: true } : prev));
      }
    } catch {
      // Silently fail
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
        setCourse((prev) =>
          prev
            ? { ...prev, isFavorited: json.favorited }
            : prev
        );
      }
    } catch {
      // Silently fail
    } finally {
      setTogglingFav(false);
    }
  };

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

  /** Handle section click → open classroom */
  const handleSectionClick = async (section: SectionItem) => {
    if (!course) return;
    try {
      const res = await fetch(`/api/sections/${section.id}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data.content) {
        const slides: SlideContent[] = Array.isArray(json.data.content)
          ? json.data.content
          : [];
        const classroomState: ClassroomState = {
          courseId: course.id,
          courseTitle: course.title,
          sectionId: section.id,
          sectionTitle: section.title,
          slides,
          currentSlide: 0,
          totalPages: slides.length || section.totalPages,
        };
        openClassroom(classroomState);
      }
    } catch {
      // Silently fail
    }
  };

  /** Render star rating */
  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`h-4 w-4 ${
            i <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
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
        {/* Breadcrumb skeleton */}
        <div className="flex items-center gap-2 mb-6">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-40" />
        </div>

        {/* Hero skeleton */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          <Skeleton className="w-full md:w-[480px] aspect-video rounded-xl" />
          <div className="flex-1 space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
            <div className="flex gap-4 pt-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-10 w-36" />
            </div>
          </div>
        </div>

        {/* Curriculum skeleton */}
        <Skeleton className="h-6 w-32 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────
  if (error || !course) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8 text-center">
        <p className="text-muted-foreground text-lg mb-4">{error || "Course not found"}</p>
        <Button variant="outline" onClick={goBack}>
          <ChevronLeft className="h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const totalLessons = course.sections.reduce((sum, s) => sum + s.totalPages, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ─── Breadcrumbs ──────────────────────────── */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              className="cursor-pointer"
              onClick={() => navigateTo("home")}
            >
              Home
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              className="cursor-pointer"
              onClick={() => navigateTo("courses")}
            >
              All Courses
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium truncate max-w-[200px] sm:max-w-[300px]">
              {course.title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* ─── Course Hero ──────────────────────────── */}
      <div className="flex flex-col md:flex-row gap-6 mb-6">
        {/* Cover Image */}
        <div className="w-full md:w-[480px] shrink-0">
          <div className="aspect-video overflow-hidden rounded-xl border border-border/50 bg-muted">
            {!imgError && course.coverImage ? (
              <img
                src={course.coverImage}
                alt={course.title}
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center"
                style={getGradientStyle()}
              >
                <span className="text-4xl font-bold text-white/90">
                  {course.title.charAt(0)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Course Info */}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground leading-tight mb-3">
            {course.title}
          </h1>

          {/* Rating */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-0.5">
              {renderStars(course.rating)}
            </div>
            <span className="text-sm font-medium text-foreground">
              {course.rating.toFixed(1)}
            </span>
          </div>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground mb-4">
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              {course.sections.length} Chapters
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BookOpen className="h-4 w-4" />
              {totalLessons} Lessons
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {course.studentCount.toLocaleString()} Students
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Updated {formatDate(course.updatedAt)}
            </span>
          </div>

          {/* Language Badge */}
          {course.language && (
            <Badge variant="secondary" className="mb-4">
              {course.language}
            </Badge>
          )}

          {/* Description */}
          {course.description && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {course.description}
            </p>
          )}
        </div>
      </div>

      {/* ─── Action Bar ──────────────────────────── */}
      <Separator className="my-4" />
      <div className="flex flex-wrap items-center gap-3 mb-8">
        {/* Favorite Button */}
        <Button
          variant="outline"
          size="default"
          className="gap-2"
          onClick={handleToggleFavorite}
          disabled={togglingFav}
        >
          <Heart
            className={`h-4 w-4 transition-colors ${
              course.isFavorited
                ? "fill-red-500 text-red-500"
                : "text-muted-foreground"
            }`}
          />
          {course.isFavorited ? "Favorited" : "Favorite"}
        </Button>

        {/* Share Button */}
        <Button variant="outline" size="default" className="gap-2" onClick={handleShare}>
          <Share2 className="h-4 w-4" />
          Share
        </Button>

        {/* Start Learning Button */}
        <Button
          size="default"
          className="ml-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
          onClick={
            course.isEnrolled
              ? () => {
                  if (course.sections.length > 0) {
                    handleSectionClick(course.sections[0]);
                  }
                }
              : handleEnroll
          }
          disabled={enrolling}
        >
          {enrolling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : course.isEnrolled ? (
            <BookOpen className="h-4 w-4" />
          ) : (
            <BookOpen className="h-4 w-4" />
          )}
          {course.isEnrolled ? "Continue Learning" : "Start Learning"}
        </Button>
      </div>

      {/* ─── Curriculum Section ───────────────────── */}
      <section>
        <h2 className="text-xl font-bold text-foreground mb-4">Curriculum</h2>

        {course.sections.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            No chapters available yet.
          </p>
        ) : (
          <Accordion type="multiple" className="w-full border rounded-xl bg-card">
            {course.sections.map((section, index) => (
              <AccordionItem
                key={section.id}
                value={section.id}
                className="px-4 border-b-0 last:border-b-0"
              >
                <AccordionTrigger
                  className="hover:no-underline py-4 group"
                  onClick={() => handleSectionClick(section)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    {/* Section Number */}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {index + 1}
                    </span>

                    {/* Title & Page Count */}
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-foreground block truncate">
                        {section.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {section.totalPages} pages
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  <p className="text-sm text-muted-foreground pl-10">
                    Click &quot;{section.title}&quot; to open the lesson viewer and start learning.
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </section>

      {/* ─── Browser Warning ─────────────────────── */}
      <div className="mt-8 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
        <p>
          For the best learning experience, we recommend using the{" "}
          <span className="font-semibold">Google Chrome</span> browser.
        </p>
      </div>
    </main>
  );
}
