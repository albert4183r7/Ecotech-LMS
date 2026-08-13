"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import { AchievementBadges } from "@/components/lms/achievement-badges";
import { CertificateModal } from "@/components/lms/certificate-modal";

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

function CircularProgress({ percentage }: { percentage: number }) {
  const radius = 70;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset =
    circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg
        width={radius * 2}
        height={radius * 2}
        className="-rotate-90"
      >
        {/* Background track */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/30"
        />
        {/* Progress arc with gradient stroke */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke="url(#progress-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient
            id="progress-gradient"
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold tracking-tight text-foreground">
          {percentage}%
        </span>
        <span className="mt-0.5 text-[11px] font-medium text-muted-foreground">
          completed
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Mini Card (used inside profile stats panel)                   */
/* ------------------------------------------------------------------ */

function StatMini({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="group flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-gradient-to-b from-muted/40 to-transparent px-4 py-4 transition-all duration-200 hover:border-primary/20 hover:shadow-sm">
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color} transition-transform duration-200 group-hover:scale-110`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <span className="text-xl font-extrabold leading-none text-foreground">
        {value}
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Leaderboard types                                                 */
/* ------------------------------------------------------------------ */

interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  department: string;
  completedCourses: number;
  avgProgress: number;
  score: number;
  isCurrentUser: boolean;
}

/* ------------------------------------------------------------------ */
/*  Medal badge for top-3 ranks                                       */
/* ------------------------------------------------------------------ */

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 via-yellow-400 to-yellow-500 text-[11px] font-extrabold text-yellow-900 shadow-sm">
        1
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-300 via-gray-200 to-slate-300 text-[11px] font-extrabold text-gray-700 shadow-sm">
        2
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-600 via-orange-500 to-amber-700 text-[11px] font-extrabold text-amber-100 shadow-sm">
        3
      </div>
    );
  }
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
      {rank}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Leaderboard Skeleton                                              */
/* ------------------------------------------------------------------ */

function LeaderboardSkeleton() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Team Leaderboard Card                                             */
/* ------------------------------------------------------------------ */

function TeamLeaderboardCard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch('/api/leaderboard');
        const json = await res.json();
        if (json.success) {
          setEntries(json.data);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  if (loading) {
    return <LeaderboardSkeleton />;
  }

  const currentUser = entries.find((e) => e.isCurrentUser);
  const currentUserRank = currentUser?.rank;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
              <Trophy className="h-4 w-4 text-white" />
            </div>
            Team Leaderboard
          </CardTitle>
          {currentUserRank && (
            <Badge
              variant="secondary"
              className="gap-1 bg-gradient-to-r from-cyan-600/10 to-teal-500/10 text-xs font-medium text-cyan-700 dark:text-cyan-400"
            >
              <Medal className="h-3 w-3" />
              Your rank: #{currentUserRank}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
          {entries.map((entry) => {
            const isMe = entry.isCurrentUser;
            const initials = entry.name
              .split(' ')
              .map((w) => w.charAt(0).toUpperCase())
              .slice(0, 2)
              .join('');

            return (
              <div
                key={entry.id}
                className={`group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 ${
                  isMe
                    ? 'bg-primary/5 ring-1 ring-primary/15'
                    : 'hover:bg-muted/50'
                }`}
              >
                {/* Rank badge */}
                <RankBadge rank={entry.rank} />

                {/* Avatar */}
                <Avatar className="h-8 w-8 border border-border/50">
                  <AvatarFallback
                    className={`text-xs font-semibold ${
                      isMe
                        ? 'bg-gradient-to-br from-cyan-600 to-teal-500 text-white'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>

                {/* Name + Department */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium leading-tight ${
                      isMe ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {entry.name}
                    {isMe && (
                      <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                        (You)
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {entry.department}
                  </p>
                </div>

                {/* Score */}
                <div className="text-right">
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      isMe ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {entry.score.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    pts
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Banner skeleton */}
      <Skeleton className="h-40 w-full rounded-2xl" />
      {/* Cards skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Profile Page                                                  */
/* ------------------------------------------------------------------ */

export function ProfilePage() {
  const { currentUserId } = useUserStore();
  const { navigateTo } = useNavigationStore();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [firstCompletedCourse, setFirstCompletedCourse] = useState<string | null>(null);
  const [completedDate, setCompletedDate] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/${currentUserId}`);
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

  // Fetch first completed course for certificate
  useEffect(() => {
    async function fetchCompletedCourse() {
      try {
        const res = await fetch('/api/enrollments?userId=' + currentUserId);
        const json = await res.json();
        if (json.success && json.data) {
          const completed = json.data.find(
            (e: { status: string; course: { title: string }; completedAt: string | null }) =>
              e.status === 'completed' && e.completedAt
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
    fetchCompletedCourse();
  }, [currentUserId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">
          Unable to load profile
        </p>
      </div>
    );
  }

  const initials = (profile.name || profile.email)
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join("");

  const joinDate = new Date(profile.createdAt).toLocaleDateString(
    "en-US",
    {
      month: "long",
      year: "numeric",
    }
  );

  const completedPercent =
    profile.stats.totalCourses > 0
      ? Math.round(
          (profile.stats.completed / profile.stats.totalCourses) * 100
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account and view learning overview
        </p>
      </div>

      {/* Profile Banner */}
      <div className="relative overflow-hidden rounded-2xl">
        {/* Gradient background with decorative patterns */}
        <div className="relative bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 px-6 pb-20 pt-8 sm:px-8 sm:pb-24 sm:pt-10">
          {/* Decorative geometric shapes */}
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute top-6 right-1/4 h-20 w-20 rounded-full bg-white/5" />
          {/* Diamond shape */}
          <div className="absolute top-4 left-1/3 h-16 w-16 rotate-45 rounded-sm border border-white/10" />
          {/* Small circle */}
          <div className="absolute bottom-8 right-12 h-6 w-6 rounded-full bg-white/10" />
          {/* Dots pattern */}
          <div className="absolute top-1/2 left-8 grid grid-cols-3 gap-2 opacity-20">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-1.5 w-1.5 rounded-full bg-white" />
            ))}
          </div>
          {/* Triangle hint */}
          <div className="absolute right-16 bottom-4 h-0 w-0 border-l-[12px] border-r-[12px] border-b-[20px] border-l-transparent border-r-transparent border-b-white/10" />
        </div>

        {/* Profile info overlapping the banner */}
        <div className="relative mx-4 -mt-12 sm:mx-6">
          <div className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:gap-5 sm:p-6">
            {/* Avatar with animated ring */}
            <div className="flex items-start sm:items-center">
              <div className="relative">
                {/* Animated ring */}
                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 opacity-60 blur-[2px] animate-[pulse_3s_ease-in-out_infinite]" />
                <Avatar className="relative h-20 w-20 border-4 border-card shadow-lg">
                  <AvatarFallback className="bg-gradient-to-br from-cyan-600 to-teal-500 text-2xl font-bold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">
                  {profile.name || "Unnamed User"}
                </h2>
                {/* Role badge */}
                <Badge className="gap-1 bg-gradient-to-r from-cyan-600 to-teal-500 text-[10px] font-semibold text-white hover:from-cyan-700 hover:to-teal-600">
                  <Shield className="h-3 w-3" />
                  {profile.role}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {profile.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {profile.department && (
                  <Badge
                    variant="secondary"
                    className="gap-1 text-xs"
                  >
                    <Building2 className="h-3 w-3" />
                    {profile.department}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  Joined {joinDate}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats + Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Stats Panel */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              Learning Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Circular Progress */}
            <div className="flex justify-center">
              <CircularProgress percentage={completedPercent} />
            </div>

            {/* Mini stat cards */}
            <div className="grid grid-cols-3 gap-3">
              <StatMini
                icon={BookOpen}
                label="Total Courses"
                value={profile.stats.totalCourses}
                color="bg-gradient-to-br from-blue-500 to-blue-700"
              />
              <StatMini
                icon={CheckCircle}
                label="Completed"
                value={profile.stats.completed}
                color="bg-gradient-to-br from-emerald-500 to-emerald-700"
              />
              <StatMini
                icon={Clock}
                label="In Progress"
                value={profile.stats.inProgress}
                color="bg-gradient-to-br from-amber-500 to-amber-700"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="border-border/50">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-semibold">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Create Course */}
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-cyan-600/5 to-teal-500/5 p-4 text-left transition-all duration-200 hover:border-cyan-500/30 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-teal-500/10 hover:shadow-sm"
              onClick={() => navigateTo("create-course")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-teal-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <Plus className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Create Course
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Build and publish a new learning course
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>

            {/* Browse Courses */}
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-emerald-600/5 to-cyan-500/5 p-4 text-left transition-all duration-200 hover:border-emerald-500/30 hover:bg-gradient-to-r hover:from-emerald-600/10 hover:to-cyan-500/10 hover:shadow-sm"
              onClick={() => navigateTo("courses")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-cyan-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <LayoutGrid className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  Browse Courses
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Explore the full course catalog
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>

            {/* View Certificate */}
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-cyan-600/5 to-teal-500/5 p-4 text-left transition-all duration-200 hover:border-cyan-500/30 hover:bg-gradient-to-r hover:from-cyan-600/10 hover:to-teal-500/10 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-cyan-600/5 disabled:hover:to-teal-500/5 disabled:hover:border-border/50 disabled:hover:shadow-none"
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
                <p className="text-sm font-semibold text-foreground">
                  View Certificate
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {firstCompletedCourse
                    ? `View cert for "${firstCompletedCourse.length > 30 ? firstCompletedCourse.slice(0, 30) + '...' : firstCompletedCourse}"`
                    : "Complete a course to earn a certificate"}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>

            {/* My Learning */}
            <button
              className="group flex w-full items-center gap-4 rounded-xl border border-border/50 bg-gradient-to-r from-amber-600/5 to-orange-500/5 p-4 text-left transition-all duration-200 hover:border-amber-500/30 hover:bg-gradient-to-r hover:from-amber-600/10 hover:to-orange-500/10 hover:shadow-sm"
              onClick={() => navigateTo("my-learning")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  My Learning
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Track your progress and enrolled courses
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>

            <Separator className="my-2" />

            {/* Logout */}
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                toast.success("You have been logged out.");
                navigateTo("home");
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Team Leaderboard */}
      <TeamLeaderboardCard />

      {/* Achievement Badges */}
      {profile && (
        <AchievementBadges stats={profile.stats} />
      )}

      {/* Certificate Modal */}
      <CertificateModal
        open={certificateOpen}
        onOpenChange={setCertificateOpen}
        userName={profile?.name || profile?.email || "Learner"}
        courseName={firstCompletedCourse || "Course"}
        completionDate={completedDate || new Date().toISOString()}
      />
    </div>
  );
}
