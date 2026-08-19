"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNavigation } from "@/hooks/use-navigation";
import {
  BookOpen,
  CheckCircle,
  Clock,
  Download,
  Eye,
  Heart,
  MessageSquare,
  Play,
  Star,
  Trash2,
  Trophy,
  User,
} from "lucide-react";
import { useState } from "react";

export interface EnrollmentCourse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  language: string;
  category: { id: string; name: string; color: string | null } | null;
  lessonsCount: number;
}
export interface EnrollmentItem {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  progress: number;
  course: EnrollmentCourse;
}
export interface FavoriteCourse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  studentCount: number;
  language: string;
  category: { id: string; name: string; color: string | null } | null;
  lessonsCount: number;
  enrollmentsCount: number;
}
export interface FavoriteItem {
  id: string;
  createdAt: string;
  course: FavoriteCourse;
}
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Estimate remaining time based on lessons left */
export function estimateRemainingTime(progress: number, totalLessons: number): string {
  const remaining = Math.ceil(totalLessons * (1 - progress / 100));
  if (remaining <= 0) return "Almost done!";
  const hours = remaining * 0.5; // ~30 min per lesson
  if (hours < 1) return `~${Math.ceil(hours * 60)} min left`;
  if (hours < 4) return `~${Math.ceil(hours * 10) / 10} hrs left`;
  return `~${Math.ceil(hours)} hrs left`;
}

/** Format relative time for "last accessed" */
export function formatLastAccessed(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

/* ------------------------------------------------------------------ */
/*  Stats Dashboard Card                                              */
/* ------------------------------------------------------------------ */
export function CourseProgressCard({ enrollment }: { enrollment: EnrollmentItem }) {
  const { openCourseDetail, navigateTo } = useNavigation();

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to course detail as the classroom entry point
    openCourseDetail(enrollment.course.id);
  };

  const handleViewDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    openCourseDetail(enrollment.course.id);
  };

  return (
    <Card
      className="lms-card-hover card-shine border-border/50 cursor-pointer overflow-hidden"
      onClick={handleViewDetails}
    >
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Cover Image */}
          <div className="relative h-40 w-full shrink-0 overflow-hidden sm:h-auto sm:min-h-[200px] sm:w-56">
            {enrollment.course.coverImage ? (
              <img
                src={enrollment.course.coverImage}
                alt={enrollment.course.title}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-600 via-teal-500 to-emerald-500">
                <BookOpen className="h-14 w-14 text-white/30" />
              </div>
            )}
            {/* Progress overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <div className="absolute right-3 bottom-3 left-3">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  {enrollment.progress}% complete
                </span>
                <div className="flex items-center gap-1 rounded-md bg-black/40 px-2 py-0.5 backdrop-blur-sm">
                  <Clock className="h-3 w-3 text-white/80" />
                  <span className="text-[10px] font-medium text-white/80">
                    {estimateRemainingTime(enrollment.progress, enrollment.course.lessonsCount)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="relative flex flex-1 flex-col justify-between gap-3 p-5">
            <div>
              {/* Category & Sections */}
              <div className="mb-2 flex items-center gap-2">
                {enrollment.course.category && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {enrollment.course.category.name}
                  </Badge>
                )}
                <span className="text-muted-foreground text-[11px]">
                  {enrollment.course.lessonsCount} lessons
                </span>
              </div>

              {/* Title */}
              <h4 className="text-foreground text-base leading-snug font-bold">
                {enrollment.course.title}
              </h4>

              {/* Instructor placeholder & Last Accessed */}
              <div className="mt-2 flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-600">
                    <User className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-muted-foreground text-[11px]">Instructor</span>
                </div>
                <span className="text-muted-foreground text-[11px]">
                  Last accessed {formatLastAccessed(enrollment.enrolledAt)}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-3 flex items-center gap-3">
                <Progress value={enrollment.progress} className="h-2 flex-1" />
                <span className="text-foreground text-sm font-bold tabular-nums">
                  {enrollment.progress}%
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="from-primary gap-1.5 bg-gradient-to-r to-teal-500 font-semibold text-white shadow-sm hover:opacity-90"
                onClick={handleResume}
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 font-medium"
                onClick={handleViewDetails}
              >
                <Eye className="h-3.5 w-3.5" />
                View Details
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Enhanced Completed Course Card                                      */
/* ------------------------------------------------------------------ */
export function CompletedCourseCard({
  enrollment,
  userName,
  onOpenCertificate,
}: {
  enrollment: EnrollmentItem;
  userName: string;
  onOpenCertificate: (enrollment: EnrollmentItem) => void;
}) {
  const { openCourseDetail } = useNavigation();
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);

  const handleCardClick = () => {
    openCourseDetail(enrollment.course.id);
  };

  return (
    <Card
      className="lms-card-hover card-shine border-border/50 cursor-pointer overflow-hidden"
      onClick={handleCardClick}
    >
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Cover Image */}
          <div className="relative h-40 w-full shrink-0 overflow-hidden sm:h-auto sm:min-h-[180px] sm:w-56">
            {enrollment.course.coverImage ? (
              <img
                src={enrollment.course.coverImage}
                alt={enrollment.course.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-600 to-teal-500">
                <CheckCircle className="h-14 w-14 text-white/30" />
              </div>
            )}
            {/* Completed overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            {/* Confetti decoration */}
            <div className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/90 shadow-lg">
              <Trophy className="h-4 w-4 text-white" />
            </div>
            <div className="absolute bottom-3 left-3">
              <span className="flex items-center gap-1 rounded-md bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                <CheckCircle className="h-3 w-3" />
                COMPLETED
              </span>
            </div>
          </div>

          {/* Content */}
          <div className="relative flex flex-1 flex-col justify-between gap-3 p-5">
            <div>
              {/* Category & Completion Date */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {enrollment.course.category && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {enrollment.course.category.name}
                  </Badge>
                )}
                {enrollment.completedAt && (
                  <span className="text-muted-foreground text-[11px]">
                    Completed {formatDate(enrollment.completedAt)}
                  </span>
                )}
              </div>

              {/* Title with checkmark */}
              <div className="flex items-start gap-2">
                <h4 className="text-foreground text-base leading-snug font-bold">
                  {enrollment.course.title}
                </h4>
              </div>

              {/* Star Rating */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-muted-foreground text-[11px] font-medium">Rate Course:</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className="transition-transform hover:scale-110"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedRating(star);
                      }}
                    >
                      <Star
                        className={`h-4 w-4 transition-colors ${
                          star <= (hoverRating || selectedRating)
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                  ))}
                  {selectedRating > 0 && (
                    <span className="ml-1 text-[10px] font-medium text-amber-500">
                      {selectedRating}/5
                    </span>
                  )}
                </div>
              </div>

              {/* Full progress bar */}
              <Progress value={100} className="mt-3 h-1.5 [&>div]:bg-emerald-500" />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                size="sm"
                className="gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 font-semibold text-white shadow-sm hover:opacity-90"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCertificate(enrollment);
                }}
              >
                <Download className="h-3.5 w-3.5" />
                Download Certificate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 font-medium"
                onClick={(e) => {
                  e.stopPropagation();
                  openCourseDetail(enrollment.course.id);
                }}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Review Course
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Enhanced Favorites Card                                            */
/* ------------------------------------------------------------------ */
export function FavoritesCard({
  favorite,
  isEnrolled,
  onRemove,
}: {
  favorite: FavoriteItem;
  isEnrolled: boolean;
  onRemove: () => void;
}) {
  const { openCourseDetail } = useNavigation();

  return (
    <Card className="lms-card-hover card-shine group border-border/50 overflow-hidden">
      <CardContent className="p-0">
        {/* Cover Image */}
        <div className="relative h-40 w-full overflow-hidden">
          {favorite.course.coverImage ? (
            <img
              src={favorite.course.coverImage}
              alt={favorite.course.title}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-500 to-pink-500">
              <BookOpen className="h-12 w-12 text-white/30" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

          {/* Filled Heart */}
          <div className="absolute top-3 right-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500/90 shadow-lg transition-transform hover:scale-110">
              <Heart className="h-4 w-4 fill-white text-white" />
            </div>
          </div>

          {/* Enrollment Status */}
          <div className="absolute bottom-3 left-3">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur-sm ${
                isEnrolled ? "bg-emerald-500/90 text-white" : "bg-white/20 text-white"
              }`}
            >
              {isEnrolled ? "✓ Enrolled" : "Not Enrolled"}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Category */}
          {favorite.course.category && (
            <Badge variant="secondary" className="mb-2 px-1.5 py-0 text-[10px]">
              {favorite.course.category.name}
            </Badge>
          )}

          {/* Title */}
          <h4
            className="text-foreground hover:text-primary cursor-pointer text-sm leading-snug font-bold hover:underline"
            onClick={() => openCourseDetail(favorite.course.id)}
          >
            {favorite.course.title}
          </h4>

          {/* Metadata */}
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-3 text-[11px]">
            {favorite.course.rating > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {favorite.course.rating.toFixed(1)}
              </span>
            )}
            <span>{favorite.course.lessonsCount} lessons</span>
            <span>{favorite.course.studentCount} students</span>
          </div>

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1.5 text-xs font-medium"
              onClick={() => openCourseDetail(favorite.course.id)}
            >
              <Eye className="h-3 w-3" />
              View Course
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-xs text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
              onClick={onRemove}
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeletons                                                  */
/* ------------------------------------------------------------------ */
