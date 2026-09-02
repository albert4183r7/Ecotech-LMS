"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LogOut,
  Plus,
  GraduationCap,
  Shield,
  Building2,
  ArrowRight,
  LayoutGrid,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { toast } from "sonner";
import { useUserStore } from "@/stores/lms-store";
import { useNavigation } from "@/hooks/use-navigation";

import { ProfileSkeleton } from "@/components/lms/profile/profile-skeleton";
import { startTour } from "@/components/lms/onboarding-tour";

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
  roles: string[];
  department: string | null;
  createdAt: string;
  stats: UserStats;
}

/* ------------------------------------------------------------------ */
/*  Circular Progress Ring                                             */
/* ------------------------------------------------------------------ */

export function ProfilePage() {
  const { currentUserId, currentRole, setCurrentRole, logout } = useUserStore();
  const { navigateTo } = useNavigation();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

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

  const switchRole = async (role: "student" | "instructor") => {
    try {
      const response = await fetch("/api/auth/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        toast.error(json.error || "Unable to switch role.");
        return;
      }
      setCurrentRole(role);
      toast.success(`Switched to ${role === "student" ? "Student" : "Instructor"} mode.`);
      navigateTo("home");
    } catch {
      toast.error("Failed to switch role. Please try again.");
    }
  };

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
                  {currentRole}
                </Badge>
                {profile.roles.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => switchRole(currentRole === "student" ? "instructor" : "student")}
                  >
                    Switch to {currentRole === "student" ? "Instructor" : "Student"}
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{profile.email}</p>
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {profile.roles.length > 1 && (
                  <span className="text-muted-foreground text-xs">
                    Also available as{" "}
                    {profile.roles.filter((role) => role !== currentRole).join(" & ")}
                  </span>
                )}
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
              // Starts now. It used to clear the flag the tour reads on mount
              // and promise something for the next reload, which read as a
              // button that did nothing.
              localStorage.removeItem(`ecotech_onboarding_done_${currentRole}`);
              startTour();
            }}
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-purple-500 text-white shadow-sm transition-transform duration-200 group-hover:scale-110">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground text-sm font-semibold">Retake Tour</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {currentRole === "instructor"
                  ? "Replay the guide to building and publishing courses"
                  : "Replay the guide to finding and taking courses"}
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
  );
}
