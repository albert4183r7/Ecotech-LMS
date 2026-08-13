"use client";

import { useState } from "react";
import { Heart, Star } from "lucide-react";
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

/** Reusable course card component for grid displays */
export function CourseCard({
  course,
  showFavorite = false,
  isFavorited = false,
  onToggleFavorite,
}: CourseCardProps) {
  const { openCourseDetail } = useNavigationStore();
  const [imgError, setImgError] = useState(false);

  /** Generate gradient fallback for course cover */
  const getGradientStyle = (): React.CSSProperties => {
    if (course.category?.color && !imgError) return {};
    const colors = [
      "linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)",
      "linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)",
      "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
      "linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)",
      "linear-gradient(135deg, #059669 0%, #10b981 100%)",
      "linear-gradient(135deg, #0891b2 0%, #0d9488 100%)",
    ];
    const index =
      course.title.charCodeAt(0) % colors.length;
    return { background: colors[index] };
  };

  return (
    <Card
      className="lms-card-hover cursor-pointer overflow-hidden border border-border/50 bg-card"
      onClick={() => openCourseDetail(course.id)}
    >
      {/* Cover Image */}
      <div className="relative aspect-video overflow-hidden">
        {!imgError && course.coverImage ? (
          <img
            src={course.coverImage}
            alt={course.title}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={getGradientStyle()}
          >
            <span className="text-2xl font-bold text-white/90">
              {course.title.charAt(0)}
            </span>
          </div>
        )}

        {/* Favorite Button */}
        {showFavorite && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite?.(course.id);
            }}
            className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-card/80 backdrop-blur-sm transition-colors hover:bg-card"
          >
            <Heart
              className={`h-4 w-4 ${
                isFavorited
                  ? "fill-red-500 text-red-500"
                  : "text-muted-foreground"
              }`}
            />
          </button>
        )}

        {/* Category Badge */}
        {course.category && (
          <Badge className="absolute bottom-2 left-2 bg-primary/90 text-primary-foreground text-xs">
            {course.category.name}
          </Badge>
        )}
      </div>

      {/* Card Content */}
      <CardContent className="p-3">
        <h3 className="font-semibold text-sm leading-tight line-clamp-2 text-foreground">
          {course.title}
        </h3>

        <div className="mt-2 flex items-center justify-between">
          {/* Rating */}
          <div className="flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="text-xs font-medium text-muted-foreground">
              {course.rating.toFixed(1)}
            </span>
          </div>

          {/* Student Count */}
          <span className="text-xs text-muted-foreground">
            {course.studentCount} students
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
