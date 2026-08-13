"use client";

import { useState } from "react";
import { Heart, Star, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CourseItem } from "@/types/lms";
import { useNavigationStore } from "@/stores/lms-store";

interface CourseCardProps {
  course: CourseItem;
  showFavorite?: boolean;
  isFavorited?: boolean;
  onToggleFavorite?: (courseId: string) => void;
}

/** Gradient palette for course cover fallbacks */
const GRADIENT_PALETTE = [
  "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)",
  "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
  "linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)",
  "linear-gradient(135deg, #059669 0%, #10b981 100%)",
  "linear-gradient(135deg, #0891b2 0%, #0d9488 100%)",
  "linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)",
  "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
];

/** Reusable course card component for grid displays */
export function CourseCard({
  course,
  showFavorite = false,
  isFavorited = false,
  onToggleFavorite,
}: CourseCardProps) {
  const { openCourseDetail } = useNavigationStore();
  const [imgError, setImgError] = useState(false);

  /** Get gradient style based on course title hash */
  const getGradientStyle = (): React.CSSProperties => {
    if (course.category?.color && !imgError) return {};
    const index = course.title.charCodeAt(0) % GRADIENT_PALETTE.length;
    return { background: GRADIENT_PALETTE[index] };
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
      className="lms-card-hover group cursor-pointer overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm transition-shadow duration-300 hover:shadow-md"
      onClick={() => openCourseDetail(course.id)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`View course: ${course.title}`}
    >
      {/* Cover Image */}
      <div className="relative aspect-video overflow-hidden">
        {!imgError && course.coverImage ? (
          <img
            src={course.coverImage}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={getGradientStyle()}
          >
            <span className="text-3xl font-bold text-white/80 drop-shadow-sm">
              {course.title.charAt(0)}
            </span>
          </div>
        )}

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Favorite Button */}
        {showFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.(course.id);
            }}
            className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm transition-all duration-200 hover:bg-card hover:scale-110"
            aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart
              className={`h-4 w-4 transition-colors duration-200 ${
                isFavorited
                  ? "fill-red-500 text-red-500"
                  : "text-muted-foreground hover:text-red-400"
              }`}
            />
          </button>
        )}

        {/* Category Badge */}
        {course.category && (
          <Badge className="absolute bottom-2.5 left-2.5 border-0 bg-primary/90 text-primary-foreground text-[11px] font-medium shadow-sm">
            {course.category.name}
          </Badge>
        )}
      </div>

      {/* Card Content */}
      <CardContent className="p-3.5">
        <h3 className="font-semibold text-sm leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors duration-200">
          {course.title}
        </h3>

        <div className="mt-2.5 flex items-center justify-between">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-medium text-foreground/70">
              {course.rating.toFixed(1)}
            </span>
          </div>

          {/* Student Count */}
          <div className="flex items-center gap-1 text-muted-foreground">
            <Users className="h-3 w-3" />
            <span className="text-xs">
              {course.studentCount}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
