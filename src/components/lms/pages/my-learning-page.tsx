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
import { Skeleton } from "@/components/ui/skeleton";
import { CourseCard } from "@/components/lms/course-card";
import { CertificateModal } from "@/components/lms/certificate-modal";
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

/** Estimate remaining time based on sections left */
function estimateRemainingTime(progress: number, totalSections: number): string {
  const remaining = Math.ceil(totalSections * (1 - progress / 100));
  if (remaining <= 0) return "Almost done!";
  const hours = remaining * 0.5; // ~30 min per section
  if (hours < 1) return `~${Math.ceil(hours * 60)} min left`;
  if (hours < 4) return `~${Math.ceil(hours * 10) / 10} hrs left`;
  return `~${Math.ceil(hours)} hrs left`;
}

/** Format relative time for "last accessed" */
function formatLastAccessed(dateStr: string): string {
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

function StatsDashboardCard({
  icon: Icon,
  label,
  value,
  gradient,
  sub,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div className="glass-card lms-card-hover rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${gradient}`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="mb-1 h-7 w-12" />
          ) : (
            <p className="text-2xl font-extrabold leading-none tracking-tight text-foreground">
              {value}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
            {label}
          </p>
          {sub && !loading && (
            <p className="text-[10px] font-medium text-emerald-500">{sub}</p>
          )}
        </div>
      </div>
    </div>
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
/*  Enhanced Empty States with SVG Illustrations                       */
/* ------------------------------------------------------------------ */

function EnhancedEmptyState({
  type,
  onAction,
}: {
  type: "in-progress" | "completed" | "favorites";
  onAction: () => void;
}) {
  const config = {
    "in-progress": {
      svg: (
        <svg viewBox="0 0 120 120" className="h-28 w-28" fill="none">
          <rect x="20" y="30" width="60" height="70" rx="4" className="fill-primary/10 stroke-primary/30" strokeWidth="2" />
          <rect x="26" y="38" width="48" height="4" rx="2" className="fill-primary/20" />
          <rect x="26" y="48" width="36" height="4" rx="2" className="fill-primary/15" />
          <rect x="26" y="58" width="42" height="4" rx="2" className="fill-primary/15" />
          <rect x="26" y="68" width="30" height="4" rx="2" className="fill-primary/15" />
          <circle cx="90" cy="85" r="20" className="fill-teal-500/20 stroke-teal-500/40" strokeWidth="2" />
          <path d="M83 85 L88 90 L98 80" className="stroke-teal-500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="55" y="22" width="30" height="14" rx="3" className="fill-amber-400/20 stroke-amber-400/40" strokeWidth="1.5" transform="rotate(-10 70 29)" />
        </svg>
      ),
      title: "No courses in progress",
      description: "No courses in progress. Browse our catalog to get started!",
      btnText: "Browse Courses",
      gradient: "from-blue-500 to-cyan-500",
    },
    completed: {
      svg: (
        <svg viewBox="0 0 120 120" className="h-28 w-28" fill="none">
          <path d="M60 10 L72 38 H100 L78 55 L86 85 L60 68 L34 85 L42 55 L20 38 H48 Z" className="fill-amber-400/20 stroke-amber-400/40" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="60" cy="58" r="14" className="fill-emerald-500/20 stroke-emerald-500/40" strokeWidth="2" />
          <path d="M54 58 L58 62 L67 53" className="stroke-emerald-500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
      title: "No completed courses yet",
      description: "No completed courses yet. Keep learning!",
      btnText: "Start Learning",
      gradient: "from-emerald-500 to-teal-500",
    },
    favorites: {
      svg: (
        <svg viewBox="0 0 120 120" className="h-28 w-28" fill="none">
          <path
            d="M60 100 L25 75 C15 68 10 55 20 42 C30 29 48 30 60 45 C72 30 90 29 100 42 C110 55 105 68 95 75 Z"
            className="fill-rose-400/20 stroke-rose-400/40"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M60 88 L33 68 C25 62 22 52 29 43 C36 34 50 35 60 46 C70 35 84 34 91 43 C98 52 95 62 87 68 Z"
            className="fill-rose-500/30 stroke-rose-500/50"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ),
      title: "No favorite courses",
      description: "No favorite courses. Save courses you're interested in!",
      btnText: "Explore Courses",
      gradient: "from-rose-500 to-pink-500",
    },
  };

  const c = config[type];

  return (
    <div className="glass-card relative flex flex-col items-center justify-center overflow-hidden rounded-2xl py-16 text-center">
      {/* Decorative gradient background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-1/4 h-40 w-40 rounded-full bg-gradient-to-br from-primary/5 to-transparent blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-32 w-32 rounded-full bg-gradient-to-tr from-amber-400/5 to-transparent blur-3xl" />
      </div>

      <div className="relative mb-4">
        {c.svg}
      </div>
      <h3 className="relative text-lg font-bold text-foreground">
        {c.title}
      </h3>
      <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {c.description}
      </p>
      <Button
        variant="outline"
        className={`relative mt-6 gap-2 bg-gradient-to-r ${c.gradient} border-0 font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg`}
        onClick={onAction}
      >
        <Sparkles className="h-4 w-4" />
        {c.btnText}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Enhanced In-Progress Course Card                                    */
/* ------------------------------------------------------------------ */

function CourseProgressCard({
  enrollment,
}: {
  enrollment: EnrollmentItem;
}) {
  const { openCourseDetail, navigateTo } = useNavigationStore();

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
      className="lms-card-hover card-shine cursor-pointer overflow-hidden border-border/50"
      onClick={handleViewDetails}
    >
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Cover Image */}
          <div className="relative h-40 w-full shrink-0 overflow-hidden sm:h-auto sm:w-56 sm:min-h-[200px]">
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
            <div className="absolute bottom-3 left-3 right-3">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-black/40 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  {enrollment.progress}% complete
                </span>
                <div className="flex items-center gap-1 rounded-md bg-black/40 px-2 py-0.5 backdrop-blur-sm">
                  <Clock className="h-3 w-3 text-white/80" />
                  <span className="text-[10px] font-medium text-white/80">
                    {estimateRemainingTime(enrollment.progress, enrollment.course.sectionsCount)}
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

              {/* Title */}
              <h4 className="text-base font-bold leading-snug text-foreground">
                {enrollment.course.title}
              </h4>

              {/* Instructor placeholder & Last Accessed */}
              <div className="mt-2 flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-slate-400 to-slate-600">
                    <User className="h-3 w-3 text-white" />
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Instructor
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Last accessed {formatLastAccessed(enrollment.enrolledAt)}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="mt-3 flex items-center gap-3">
                <Progress
                  value={enrollment.progress}
                  className="h-2 flex-1"
                />
                <span className="text-sm font-bold tabular-nums text-foreground">
                  {enrollment.progress}%
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="gap-1.5 bg-gradient-to-r from-primary to-teal-500 font-semibold text-white shadow-sm hover:opacity-90"
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

function CompletedCourseCard({
  enrollment,
  userName,
  onOpenCertificate,
}: {
  enrollment: EnrollmentItem;
  userName: string;
  onOpenCertificate: (enrollment: EnrollmentItem) => void;
}) {
  const { openCourseDetail } = useNavigationStore();
  const [hoverRating, setHoverRating] = useState(0);
  const [selectedRating, setSelectedRating] = useState(0);

  const handleCardClick = () => {
    openCourseDetail(enrollment.course.id);
  };

  return (
    <Card
      className="lms-card-hover card-shine cursor-pointer overflow-hidden border-border/50"
      onClick={handleCardClick}
    >
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Cover Image */}
          <div className="relative h-40 w-full shrink-0 overflow-hidden sm:h-auto sm:w-56 sm:min-h-[180px]">
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

              {/* Title with checkmark */}
              <div className="flex items-start gap-2">
                <h4 className="text-base font-bold leading-snug text-foreground">
                  {enrollment.course.title}
                </h4>
              </div>

              {/* Star Rating */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">Rate Course:</span>
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
              <Progress
                value={100}
                className="mt-3 h-1.5 [&>div]:bg-emerald-500"
              />
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

function FavoritesCard({
  favorite,
  isEnrolled,
  onRemove,
}: {
  favorite: FavoriteItem;
  isEnrolled: boolean;
  onRemove: () => void;
}) {
  const { openCourseDetail } = useNavigationStore();

  return (
    <Card
      className="lms-card-hover card-shine group overflow-hidden border-border/50"
    >
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
                isEnrolled
                  ? "bg-emerald-500/90 text-white"
                  : "bg-white/20 text-white"
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
            <Badge
              variant="secondary"
              className="mb-2 text-[10px] px-1.5 py-0"
            >
              {favorite.course.category.name}
            </Badge>
          )}

          {/* Title */}
          <h4
            className="cursor-pointer text-sm font-bold leading-snug text-foreground hover:text-primary hover:underline"
            onClick={() => openCourseDetail(favorite.course.id)}
          >
            {favorite.course.title}
          </h4>

          {/* Metadata */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {favorite.course.rating > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                {favorite.course.rating.toFixed(1)}
              </span>
            )}
            <span>{favorite.course.sectionsCount} sections</span>
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
  const { navigateTo } = useNavigationStore();

  const [stats, setStats] = useState<UserStats | null>(null);
  const [enrollments, setEnrollmentsState] = useState<EnrollmentItem[]>([]);
  const [favorites, setFavoritesState] = useState<FavoriteItem[]>([]);
  const [userName, setUserName] = useState<string>("");
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingEnrollments, setLoadingEnrollments] = useState(true);
  const [loadingFavorites, setLoadingFavorites] = useState(true);

  // Certificate modal state
  const [certOpen, setCertOpen] = useState(false);
  const [certCourseName, setCertCourseName] = useState("");
  const [certCompletionDate, setCertCompletionDate] = useState("");

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/user/${currentUserId}`);
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
    [currentUserId, favorites, fetchFavorites]
  );

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

  /* Calculate derived stats */
  const totalLearningHours =
    enrollments.length > 0
      ? Math.round(
          enrollments.reduce((acc, e) => {
            const completedSections = Math.round(
              (e.progress / 100) * e.course.sectionsCount
            );
            return acc + completedSections * 0.5; // ~30 min per section
          }, 0) * 10
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
          Math.max(
            1,
            Math.floor(
              inProgressList.reduce((acc, e) => acc + e.progress, 0) / 50
            )
          ),
          30
        )
      : 0;

  const avgCompletionRate = stats?.avgProgress ?? 0;

  /* Certificate handlers */
  const handleOpenCertificate = useCallback(
    (enrollment: EnrollmentItem) => {
      setCertCourseName(enrollment.course.title);
      setCertCompletionDate(
        enrollment.completedAt || new Date().toISOString()
      );
      setCertOpen(true);
    },
    []
  );

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
        <h1 className="text-2xl font-bold text-foreground">My Learning</h1>
        <p className="mt-1 text-sm text-muted-foreground">
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
            <EnhancedEmptyState
              type="in-progress"
              onAction={() => navigateTo("courses")}
            />
          ) : (
            <div className="space-y-4">
              {inProgressList.map((enrollment) => (
                <CourseProgressCard
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
            <EnhancedEmptyState
              type="completed"
              onAction={() => navigateTo("courses")}
            />
          ) : (
            <div className="space-y-4">
              {completedList.map((enrollment) => (
                <CompletedCourseCard
                  key={enrollment.id}
                  enrollment={enrollment}
                  userName={userName || "Learner"}
                  onOpenCertificate={handleOpenCertificate}
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
            <EnhancedEmptyState
              type="favorites"
              onAction={() => navigateTo("courses")}
            />
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

      {/* Certificate Modal */}
      <CertificateModal
        open={certOpen}
        onOpenChange={setCertOpen}
        userName={userName || "Learner"}
        courseName={certCourseName}
        completionDate={certCompletionDate}
      />
    </div>
  );
}
