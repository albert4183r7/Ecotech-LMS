"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  BookOpen,
  CheckCircle,
  Clock,
  LogOut,
  Plus,
  GraduationCap,
  Shield,
  Building2,
  ArrowRight,
  LayoutGrid,
  Trophy,
  Medal,
  FileBadge,
  Flame,
  TrendingUp,
  TrendingDown,
  Lock,
  Award,
  Star,
  Zap,
  MessageSquare,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useUserStore } from "@/stores/lms-store";
import { useNavigation } from "@/hooks/use-navigation";
import { AchievementBadges } from "@/components/lms/achievement-badges";
import { ActivityChart } from "@/components/lms/activity-chart";
import { CertificateModal } from "@/components/lms/certificate-modal";
import { SkeletonList } from "@/components/lms/skeleton-cards";
import { CourseBookmarks } from "@/components/lms/course-bookmarks";
import { XpBarFull } from "@/components/lms/xp-bar";
import {
  RankBadge,
  LeaderboardSkeleton,
  TeamLeaderboardCard,
  LeaderboardEntry,
} from "@/components/lms/profile/leaderboard";
import {
  CircularProgress,
  useAnimatedCounter,
  EnhancedStatCard,
  XPDisplay,
} from "@/components/lms/profile/stats";
import {
  StreakCalendar,
  SkillsBadgesGrid,
  LearningPathTimeline,
  SkillBadge,
} from "@/components/lms/profile/activity";
import { ProfileSkeleton } from "@/components/lms/profile/profile-skeleton";
import type { EnrollmentData } from "@/types/lms";

/* ------------------------------------------------------------------ */
/*  Local types                                                       */
/* ------------------------------------------------------------------ */

interface UserStats {
  totalCourses: number;
  inProgress: number;
  completed: number;
  avgProgress: number;
  favoritesCount: number;
}

interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: string;
  department: string | null;
  createdAt: string;
  stats: UserStats;
}

/* ------------------------------------------------------------------ */
/*  Circular Progress Ring                                             */
/* ------------------------------------------------------------------ */

export function ProfilePage() {
  const { currentUserId, currentRole, logout } = useUserStore();
  const { navigateTo } = useNavigation();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [firstCompletedCourse, setFirstCompletedCourse] = useState<string | null>(null);
  const [completedDate, setCompletedDate] = useState<string | null>(null);

  // New state for XP / streak / badges / timeline
  const [enrollments, setEnrollments] = useState<EnrollmentData[]>([]);
  const [streakData, setStreakData] = useState({ current: 0, longest: 0 });

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${currentUserId}`);
      const json = await res.json();
      if (json.success) {
        setProfile(json.data);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [currentUserId]);

  // Fetch enrollments for XP, timeline, badges, and certificate
  useEffect(() => {
    async function fetchEnrollments() {
      try {
        const res = await fetch("/api/enrollments?userId=" + currentUserId);
        const json = await res.json();
        if (json.success && json.data) {
          setEnrollments(json.data);
          const completed = json.data.find(
            (e: { status: string; course: { title: string }; completedAt: string | null }) =>
              e.status === "completed" && e.completedAt,
          );
          if (completed) {
            setFirstCompletedCourse(completed.course.title);
            setCompletedDate(completed.completedAt);
          }
        }
      } catch {
        /* silent */
      }
    }
    fetchEnrollments();
  }, [currentUserId]);

  // Fetch activity for streak data (used by StreakCalendar and SkillsBadgesGrid)
  useEffect(() => {
    async function fetchStreak() {
      try {
        const res = await fetch(`/api/activity?userId=${currentUserId}&weeks=5`);
        const json = await res.json();
        if (json.success && json.data) {
          setStreakData(json.data.streak);
        }
      } catch {
        /* silent */
      }
    }
    fetchStreak();
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground text-sm">Unable to load profile</p>
      </div>
    );
  }

  const initials = (profile.name || profile.email)
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  const joinDate = new Date(profile.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const completedPercent =
    profile.stats.totalCourses > 0
      ? Math.round((profile.stats.completed / profile.stats.totalCourses) * 100)
      : 0;

  /* ---- XP calculation ---- */
  const completedEnrollments = enrollments.filter((e) => e.status === "completed");
  const xpFromCompletedCourses = completedEnrollments.length * 100;
  const xpFromLessons = enrollments.reduce((sum, e) => {
    // Each lesson = 10 XP; estimate completed lessons from progress percentage
    const completedLessons = Math.round((e.progress / 100) * (e.course.lessonsCount || 0));
    return sum + completedLessons * 10;
  }, 0);
  const totalXP = xpFromCompletedCourses + xpFromLessons;
  const level = Math.floor(totalXP / 500) + 1;
  const progressToNext = (totalXP % 500) / 5; // percentage toward next 500 XP

  /* ---- Badge condition helpers ---- */
  const completedInOneDay = completedEnrollments.some((e) => {
    if (!e.completedAt || !e.enrolledAt) return false;
    const enrolled = new Date(e.enrolledAt);
    const completed = new Date(e.completedAt);
    const diffMs = completed.getTime() - enrolled.getTime();
    return diffMs <= 24 * 60 * 60 * 1000;
  });
  // Estimate total slides viewed: each completed lesson ~ 10 slides
  const totalSlidesViewed = enrollments.reduce((sum, e) => {
    const completedLessons = Math.round((e.progress / 100) * (e.course.lessonsCount || 0));
    return sum + completedLessons * 10;
  }, 0);
  // Comment count: use a mock estimate (no comments API tied to user)
  const commentCount = 3; // placeholder; adjust when comments API supports user filtering

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-foreground text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manage your account and view learning overview
        </p>
      </div>

      {/* Profile Banner */}
      <div className="relative overflow-hidden rounded-2xl">
        {/* Gradient background with decorative patterns */}
        <div className="relative bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 px-6 pt-8 pb-20 sm:px-8 sm:pt-10 sm:pb-24">
          {/* Decorative geometric shapes */}
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute top-6 right-1/4 h-20 w-20 rounded-full bg-white/5" />
          {/* Diamond shape */}
          <div className="absolute top-4 left-1/3 h-16 w-16 rotate-45 rounded-sm border border-white/10" />
          {/* Small circle */}
          <div className="absolute right-12 bottom-8 h-6 w-6 rounded-full bg-white/10" />
          {/* Dots pattern */}
          <div className="absolute top-1/2 left-8 grid grid-cols-3 gap-2 opacity-20">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-white" />
            ))}
          </div>
          {/* Triangle hint */}
          <div className="absolute right-16 bottom-4 h-0 w-0 border-r-[12px] border-b-[20px] border-l-[12px] border-r-transparent border-b-white/10 border-l-transparent" />
        </div>

        {/* Profile info overlapping the banner */}
        <div className="relative mx-4 -mt-12 sm:mx-6">
          <div className="border-border/50 bg-card flex flex-col gap-4 rounded-xl border p-5 shadow-sm sm:flex-row sm:items-center sm:gap-5 sm:p-6">
            {/* Avatar with animated ring */}
            <div className="flex items-start sm:items-center">
              <div className="relative">
                {/* Animated ring */}
                <div className="absolute -inset-1 animate-[pulse_3s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 opacity-60 blur-[2px]" />
                <Avatar className="border-card relative h-20 w-20 border-4 shadow-lg">
                  <AvatarFallback className="bg-gradient-to-br from-cyan-600 to-teal-500 text-2xl font-bold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-foreground text-xl font-bold">
                  {profile.name || "Unnamed User"}
                </h2>
                {/* Role badge */}
                <Badge className="gap-1 bg-gradient-to-r from-cyan-600 to-teal-500 text-[10px] font-semibold text-white hover:from-cyan-700 hover:to-teal-600">
                  <Shield className="h-3 w-3" />
                  {profile.role}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">{profile.email}</p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {profile.department && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Building2 className="h-3 w-3" />
                    {profile.department}
                  </Badge>
                )}
                <span className="text-muted-foreground text-xs">Joined {joinDate}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats + Quick Actions */}
      <div className={currentRole === "instructor" ? "" : "grid gap-6 md:grid-cols-2"}>
        {/* Stats Panel - STUDENT ONLY */}
        {currentRole === "student" && (
          <Card className="border-border/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Learning Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Circular Progress */}
              <div className="flex justify-center">
                <CircularProgress percentage={completedPercent} />
              </div>

              {/* Enhanced stat cards with glass-morphism & animated counters */}
              <div className="grid grid-cols-3 gap-3">
                <EnhancedStatCard
                  icon={BookOpen}
                  label="Total Courses"
                  value={profile.stats.totalCourses}
                  color="bg-gradient-to-br from-blue-500 to-blue-700"
                  trend={{ value: 12, direction: "up" }}
                />
                <EnhancedStatCard
                  icon={CheckCircle}
                  label="Completed"
                  value={profile.stats.completed}
                  color="bg-gradient-to-br from-emerald-500 to-emerald-700"
                  trend={{ value: 25, direction: "up" }}
                />
                <EnhancedStatCard
                  icon={Clock}
                  label="In Progress"
                  value={profile.stats.inProgress}
                  color="bg-gradient-to-br from-amber-500 to-amber-700"
                  trend={{ value: 8, direction: "down" }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Create Course - INSTRUCTOR ONLY */}
            {currentRole === "instructor" && (
              <button
                className="group border-border/50 flex w-full items-center gap-4 rounded-xl border bg-gradient-to-r from-cyan-600/5 to-teal-500/5 p-4 text-left transition-all duration-200 hover:border-cyan-500/30 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-teal-500/10 hover:shadow-sm"
                onClick={() => navigateTo("create-course")}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">Create Course</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Build and publish a new learning course
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            )}

            {/* Browse Courses */}
            <button
              className="group border-border/50 flex w-full items-center gap-4 rounded-xl border bg-gradient-to-r from-emerald-600/5 to-cyan-500/5 p-4 text-left transition-all duration-200 hover:border-emerald-500/30 hover:bg-gradient-to-r hover:from-emerald-600/10 hover:to-cyan-500/10 hover:shadow-sm"
              onClick={() => navigateTo("courses")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-cyan-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <LayoutGrid className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">Browse Courses</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Explore the full course catalog
                </p>
              </div>
              <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            {/* View Certificate - STUDENT ONLY */}
            {currentRole === "student" && (
              <button
                className="group border-border/50 disabled:hover:border-border/50 flex w-full items-center gap-4 rounded-xl border bg-gradient-to-r from-cyan-600/5 to-teal-500/5 p-4 text-left transition-all duration-200 hover:border-cyan-500/30 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-teal-500/10 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:from-cyan-600/5 disabled:hover:to-teal-500/5 disabled:hover:shadow-none"
                onClick={() => {
                  if (firstCompletedCourse && completedDate) {
                    setCertificateOpen(true);
                  } else {
                    toast.info("Complete a course to earn a certificate!");
                  }
                }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                  <FileBadge className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">View Certificate</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {firstCompletedCourse
                      ? `View cert for "${firstCompletedCourse.length > 30 ? firstCompletedCourse.slice(0, 30) + "..." : firstCompletedCourse}"`
                      : "Complete a course to earn a certificate"}
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            )}

            {/* My Learning - STUDENT ONLY */}
            {currentRole === "student" && (
              <button
                className="group border-border/50 flex w-full items-center gap-4 rounded-xl border bg-gradient-to-r from-amber-600/5 to-orange-500/5 p-4 text-left transition-all duration-200 hover:border-amber-500/30 hover:bg-gradient-to-r hover:from-amber-600/10 hover:to-orange-500/10 hover:shadow-sm"
                onClick={() => navigateTo("my-learning")}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">My Learning</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    Track your progress and enrolled courses
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            )}

            {/* Retake Tour */}
            <button
              className="group border-border/50 flex w-full items-center gap-4 rounded-xl border bg-gradient-to-r from-violet-600/5 to-purple-500/5 p-4 text-left transition-all duration-200 hover:border-violet-500/30 hover:bg-gradient-to-r hover:from-violet-600/10 hover:to-purple-500/10 hover:shadow-sm"
              onClick={() => {
                localStorage.removeItem("ecotech_onboarding_done");
                toast.success("Tour will show on next page refresh!");
              }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-foreground text-sm font-semibold">Retake Tour</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Replay the welcome guide and feature overview
                </p>
              </div>
              <ArrowRight className="text-muted-foreground group-hover:text-primary h-4 w-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5" />
            </button>

            <Separator className="my-2" />

            {/* Logout */}
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                logout();
                toast.success("You have been logged out.");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Course Bookmark Collections - STUDENT ONLY */}
      {currentRole === "student" && <CourseBookmarks />}

      {/* Student-only widgets */}
      {currentRole === "student" && (
        <>
          {/* XP Display + Streak Calendar */}
          <div className="grid gap-6 md:grid-cols-2">
            <XPDisplay totalXP={totalXP} level={level} progressToNext={progressToNext} />
            <StreakCalendar
              streak={streakData.current}
              bestStreak={streakData.longest}
              userId={currentUserId}
            />
          </div>

          {/* Skills & Badges Grid */}
          <SkillsBadgesGrid
            completedCourses={profile.stats.completed}
            completedInOneDay={completedInOneDay}
            slidesViewed={totalSlidesViewed}
            commentCount={commentCount}
            currentStreak={streakData.current}
          />

          {/* Learning Path Timeline */}
          <LearningPathTimeline enrollments={enrollments} />

          {/* XP Level Progress (Full) */}
          <XpBarFull />

          {/* Weekly Activity Chart */}
          <ActivityChart userId={profile.id} />

          {/* Team Leaderboard */}
          <TeamLeaderboardCard />

          {/* Achievement Badges */}
          <AchievementBadges stats={profile.stats} />
        </>
      )}

      {/* Certificate Modal - STUDENT ONLY */}
      {currentRole === "student" && (
        <CertificateModal
          open={certificateOpen}
          onOpenChange={setCertificateOpen}
          userName={profile?.name || profile?.email || "Learner"}
          courseName={firstCompletedCourse || "Course"}
          completionDate={completedDate || new Date().toISOString()}
        />
      )}
    </div>
  );
}
