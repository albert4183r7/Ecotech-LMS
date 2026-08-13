"use client";

import { useEffect, useState, useCallback } from "react";
import {
  BookOpen,
  CheckCircle,
  Clock,
  LogOut,
  Plus,
  GraduationCap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigationStore, useUserStore } from "@/stores/lms-store";

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
  const radius = 54;
  const stroke = 8;
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
          className="text-muted/40"
        />
        {/* Progress arc */}
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
            y2="0%"
          >
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-foreground">
          {percentage}%
        </span>
        <span className="text-[10px] text-muted-foreground">
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
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
      <Icon className="h-4 w-4 text-cyan-600" />
      <span className="text-lg font-bold leading-none text-foreground">
        {value}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
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
        {/* Gradient background */}
        <div className="bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 px-6 pb-16 pt-8 sm:px-8 sm:pb-20 sm:pt-10">
          {/* Decorative circles */}
          <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="absolute top-6 right-1/4 h-20 w-20 rounded-full bg-white/5" />
        </div>

        {/* Profile info overlapping the banner */}
        <div className="relative mx-4 -mt-10 sm:mx-6">
          <div className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:gap-5 sm:p-6">
            {/* Avatar */}
            <div className="flex items-start sm:items-center">
              <Avatar className="h-16 w-16 border-4 border-card shadow-md">
                <AvatarFallback className="bg-gradient-to-br from-cyan-600 to-teal-500 text-xl font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Info */}
            <div className="flex-1 space-y-1">
              <h2 className="text-lg font-bold text-foreground">
                {profile.name || "Unnamed User"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {profile.email}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {profile.department && (
                  <Badge
                    variant="secondary"
                    className="text-xs"
                  >
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
              />
              <StatMini
                icon={CheckCircle}
                label="Completed"
                value={profile.stats.completed}
              />
              <StatMini
                icon={Clock}
                label="In Progress"
                value={profile.stats.inProgress}
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
          <CardContent className="space-y-4">
            {/* Create Course */}
            <Button
              className="w-full bg-gradient-to-r from-cyan-600 to-teal-500 text-white hover:from-cyan-700 hover:to-teal-600"
              onClick={() => navigateTo("create-course")}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Course
            </Button>

            {/* Learning Courses */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigateTo("my-learning")}
            >
              <GraduationCap className="mr-2 h-4 w-4" />
              Learning Courses
            </Button>

            <Separator className="my-2" />

            {/* Logout */}
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                /* Logout logic placeholder */
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
