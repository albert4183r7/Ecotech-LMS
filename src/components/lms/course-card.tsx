"use client";

import { useState } from "react";
import { Heart, Star, Users, Clock, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CourseItem } from "@/types/lms";
import { useNavigationStore } from "@/stores/lms-store";

interface CourseCardProps {
  course: CourseItem;
  index?: number;
  showFavorite?: boolean;
  isFavorited?: boolean;
  onToggleFavorite?: (courseId: string) => void;
  enrollmentProgress?: number;  // 0-100
  estimatedMinutes?: number;   // e.g., 45
  difficulty?: "beginner" | "intermediate" | "advanced";
}

/** Gradient palette for course cover fallbacks */
const GRADIENT_PALETTE = [
  "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
  "linear-gradient(135deg, #059669 0%, #10b981 100%)",
  "linear-gradient(135deg, #0891b2 0%, #0d9488 100%)",
  "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
  "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)",
];

/** Reusable course card component for grid displays */
const DIFFICULTY_CONFIG = {
  beginner: { label: "Beginner", bg: "bg-emerald-500/90 text-white", border: "border-emerald-400/30" },
  intermediate: { label: "Intermediate", bg: "bg-amber-500/90 text-white", border: "border-amber-400/30" },
  advanced: { label: "Advanced", bg: "bg-rose-500/90 text-white", border: "border-rose-400/30" },
} as const;

export function CourseCard({
  course,
  index = 0,
  showFavorite = false,
  isFavorited = false,
  onToggleFavorite,
  enrollmentProgress,
  estimatedMinutes,
  difficulty,
}: CourseCardProps) {
  const { openCourseDetail } = useNavigationStore();
  const [imgError, setImgError] = useState(false);

  /** Get gradient style based on course title hash */
  const getGradientStyle = (): React.CSSProperties => {
    if (course.category?.color && !imgError) return {};
    const hash = course.title.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const idx = hash % GRADIENT_PALETTE.length;
    return { background: GRADIENT_PALETTE[idx] };
  };

  /** Handle keyboard interaction for accessibility */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openCourseDetail(course.id);
    }
  };

  return (
    <Card
      className="lms-card-hover card-shine hover-scale card-depth-3d group cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition-all duration-300 hover:shadow-lg hover:border-primary/20 hover-lift hover-glow shimmer-border press-effect"
      onClick={() => openCourseDetail(course.id)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View course: ${course.title}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Cover Image */}
      <div className="relative aspect-video card-img-zoom">
        {!imgError && course.coverImage ? (
          <img
            src={course.coverImage}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={getGradientStyle()}
          >
            {/* Decorative pattern overlay for gradient covers */}
            <div className="absolute inset-0 opacity-10">
              <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id={`dots-${course.id}`} width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="white" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#dots-${course.id})`} />
              </svg>
            </div>
            <div className="relative flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-white/90 drop-shadow-sm line-clamp-2 text-center px-3 leading-tight">
                {course.title.length > 30 ? course.title.slice(0, 30) + "..." : course.title}
              </span>
            </div>
          </div>
        )}

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Quick-view shimmer on hover */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/0 via-primary/60 to-primary/0 scale-x-0 origin-left transition-transform duration-500 group-hover:scale-x-100" />

        {/* Difficulty Badge */}
        {difficulty && (
          <Badge
            className={`absolute top-2.5 ${showFavorite ? "right-12" : "right-2.5"} border-0 ${DIFFICULTY_CONFIG[difficulty].bg} text-[10px] font-semibold shadow-sm backdrop-blur-sm`}
          >
            {DIFFICULTY_CONFIG[difficulty].label}
          </Badge>
        )}

        {/* Favorite Button */}
        {showFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.(course.id);
            }}
            className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm transition-all duration-200 hover:bg-card hover:scale-110 shadow-sm"
            aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart
              className={`h-4 w-4 transition-all duration-200 ${
                isFavorited
                  ? "fill-red-500 text-red-500 scale-110"
                  : "text-muted-foreground/70 hover:text-red-400"
              }`}
            />
          </button>
        )}

        {/* Category Badge */}
        {course.category && (
          <Badge className="absolute bottom-2.5 left-2.5 border-0 bg-primary/90 text-primary-foreground text-[11px] font-medium shadow-sm backdrop-blur-sm">
            {course.category.name}
          </Badge>
        )}
      </div>

      {/* Card Content */}
      <CardContent className="card-content-reveal p-3.5">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors duration-200">
          {course.title}
        </h3>

        {/* Language badge for non-English courses */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {course.language && course.language !== "english" && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              <span>{course.language.slice(0, 2)}</span>
            </span>
          )}
          {course._count && course._count.enrollments > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70">
              <Users className="h-2.5 w-2.5" />
              {course._count.enrollments} enrolled
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-border/30 pt-2.5">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-semibold text-foreground">
              {course.rating.toFixed(1)}
            </span>
          </div>

          {/* Student Count & Estimated Duration */}
          <div className="flex items-center gap-2.5 text-muted-foreground">
            {estimatedMinutes != null && estimatedMinutes > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium">
                <Clock className="h-3 w-3" />
                ~{estimatedMinutes} min
              </span>
            )}
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className="text-xs font-medium tabular-nums">
                {course.studentCount.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </CardContent>

      {/* Progress Bar Overlay */}
      {enrollmentProgress != null && enrollmentProgress > 0 && (
        <div className="h-[3px] w-full bg-muted/40">
          <div
            className="h-full w-full bg-gradient-to-r from-primary to-accent progress-fill-animate rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, enrollmentProgress))}%` }}
          />
        </div>
      )}
    </Card>
  );
}
