"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  Star,
  Users,
  Eye,
  Info,
  BookOpen,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { useUserStore, useNavigationStore } from "@/stores/lms-store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RecommendedCourse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  studentCount: number;
  categoryName: string | null;
  categoryColor: string | null;
  reason: string;
}

/* ------------------------------------------------------------------ */
/*  Gradient backgrounds for cards when no cover image                 */
/* ------------------------------------------------------------------ */

const GRADIENTS = [
  "from-teal-400 to-emerald-500",
  "from-amber-400 to-orange-500",
  "from-violet-400 to-purple-500",
  "from-rose-400 to-pink-500",
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CourseRecommendations() {
  const { currentUserId } = useUserStore();
  const { openCourseDetail } = useNavigationStore();
  const [recommendations, setRecommendations] = useState<
    RecommendedCourse[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRecommendations() {
      try {
        const res = await fetch(
          `/api/recommendations?userId=${currentUserId}`
        );
        const json = await res.json();
        if (json.success) {
          setRecommendations(json.data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchRecommendations();
  }, [currentUserId]);

  if (loading) {
    return <RecommendationsSkeleton />;
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <section className="content-reveal">
      {/* Section Header */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          Recommended For You
        </h2>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="ml-1" aria-label="Recommendation info">
              <Info className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-xs">
            Based on your enrolled courses and learning history
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Horizontal Scroll Card Layout */}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {recommendations.map((course, index) => (
          <div
            key={course.id}
            className="stagger-fade-in w-64 shrink-0"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <Card className="glass-card group overflow-hidden border-border/50 transition-all hover:shadow-lg hover:border-primary/20">
              {/* Cover / Gradient */}
              <div
                className={cn(
                  "relative aspect-[16/9] w-full bg-gradient-to-br",
                  GRADIENTS[index % GRADIENTS.length]
                )}
              >
                {course.coverImage ? (
                  <img
                    src={course.coverImage}
                    alt={course.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <BookOpen className="h-8 w-8 text-white/40" />
                  </div>
                )}
                {/* Category badge */}
                {course.categoryName && (
                  <div className="absolute left-2 top-2">
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-medium backdrop-blur-sm bg-white/20 text-white border-white/10"
                    >
                      {course.categoryName}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Content */}
              <CardContent className="p-3">
                <h3 className="line-clamp-2 text-sm font-semibold text-foreground leading-snug">
                  {course.title}
                </h3>

                {/* Reason / Why this? */}
                <div className="mt-1.5 flex items-start gap-1">
                  <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-violet-500" />
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">
                    {course.reason}
                  </p>
                </div>

                {/* Rating & students */}
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    <span className="text-xs font-medium text-foreground">
                      {course.rating.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 text-muted-foreground">
                    <Users className="h-3 w-3" />
                    <span className="text-xs">{course.studentCount}</span>
                  </div>
                </div>

                {/* View button */}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2.5 h-7 w-full gap-1.5 rounded-lg text-xs"
                  onClick={() => openCourseDetail(course.id)}
                >
                  <Eye className="h-3 w-3" />
                  View Course
                </Button>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function RecommendationsSkeleton() {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-lg" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-64 shrink-0">
            <Card className="overflow-hidden border-border/50">
              <Skeleton className="aspect-[16/9] w-full" />
              <CardContent className="p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-full rounded-lg" />
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    </section>
  );
}
