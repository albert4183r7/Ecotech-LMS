"use client";

import { useState, useCallback } from "react";
import {
  Palette,
  Bell,
  BookOpen,
  Shield,
  Database,
  Info,
  Sun,
  Moon,
  Monitor,
  Trash2,
  RotateCcw,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useTheme } from "next-themes";

/* ------------------------------------------------------------------ */
/*  localStorage helpers                                              */
/* ------------------------------------------------------------------ */

const PREFIX = "ecotech_settings_";

function getSetting<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw !== null ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setSetting(key: string, value: unknown) {
  localStorage.setItem(PREFIX + key, JSON.stringify(value));
}

function clearEcotechKeys() {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("ecotech_")) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

function clearKeyPattern(pattern: string) {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(pattern)) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

/* ------------------------------------------------------------------ */
/*  Settings Page                                                      */
/* ------------------------------------------------------------------ */

export function SettingsPage() {
  const { theme, setTheme } = useTheme();

  /* Appearance */
  const [compactMode, setCompactMode] = useState(() => getSetting("compact_mode", false));

  /* Notifications */
  const [emailNotifs, setEmailNotifs] = useState(() => getSetting("email_notifications", true));
  const [pushNotifs, setPushNotifs] = useState(() => getSetting("push_notifications", true));
  const [courseUpdateAlerts, setCourseUpdateAlerts] = useState(() =>
    getSetting("course_update_alerts", true),
  );
  const [achievementAlerts, setAchievementAlerts] = useState(() =>
    getSetting("achievement_alerts", true),
  );
  const [weeklyDigest, setWeeklyDigest] = useState(() => getSetting("weekly_digest", false));

  /* Learning Preferences */
  const [dailyGoal, setDailyGoal] = useState(() => getSetting("daily_goal", "30"));
  const [studyTimer, setStudyTimer] = useState(() => getSetting("study_timer", "25"));
  const [autoPlayNext, setAutoPlayNext] = useState(() => getSetting("auto_play_next", true));

  /* Privacy */
  const [showProfilePublicly, setShowProfilePublicly] = useState(() =>
    getSetting("show_profile_publicly", false),
  );
  const [showLearningActivity, setShowLearningActivity] = useState(() =>
    getSetting("show_learning_activity", true),
  );

  /* Persist helpers */
  const updateSetting = useCallback((key: string, value: unknown) => {
    setSetting(key, value);
  }, []);

  /* Data actions */
  const handleClearSearchHistory = () => {
    localStorage.removeItem("ecotech_recent_searches");
    toast.success("Search history cleared");
  };

  const handleResetTour = () => {
    localStorage.removeItem("ecotech_onboarding_done");
    toast.success("Tour has been reset. It will appear on next page refresh.");
  };

  const handleDismissAnnouncements = () => {
    clearKeyPattern("ecotech_dismissed_ann_");
    toast.success("All announcements have been restored");
  };

  const handleClearAll = () => {
    clearEcotechKeys();
    toast.success("All local data has been cleared");
    // Re-set settings that should have defaults
    setCompactMode(false);
    setEmailNotifs(true);
    setPushNotifs(true);
    setCourseUpdateAlerts(true);
    setAchievementAlerts(true);
    setWeeklyDigest(false);
    setDailyGoal("30");
    setStudyTimer("25");
    setAutoPlayNext(true);
    setShowProfilePublicly(false);
    setShowLearningActivity(true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="text-muted-foreground">Manage your preferences and application settings.</p>
      </div>

      {/* 1. Appearance */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
              <Palette className="h-4 w-4 text-white" />
            </div>
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Theme</Label>
              <p className="text-muted-foreground text-xs">Choose your preferred color scheme</p>
            </div>
            <div className="border-border bg-muted/50 flex items-center gap-1 rounded-lg border p-1">
              {[
                { value: "light", icon: Sun, label: "Light" },
                { value: "dark", icon: Moon, label: "Dark" },
                { value: "system", icon: Monitor, label: "System" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    theme === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <opt.icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Compact Mode */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Compact Mode</Label>
              <p className="text-muted-foreground text-xs">Reduce spacing for a denser layout</p>
            </div>
            <Switch
              checked={compactMode}
              onCheckedChange={(v) => {
                setCompactMode(v);
                updateSetting("compact_mode", v);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 2. Notifications */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
              <Bell className="h-4 w-4 text-white" />
            </div>
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {(
            [
              {
                key: "email_notifications",
                label: "Email Notifications",
                desc: "Receive notifications via email",
                value: emailNotifs,
                setter: setEmailNotifs,
              },
              {
                key: "push_notifications",
                label: "Push Notifications",
                desc: "Get browser push notifications",
                value: pushNotifs,
                setter: setPushNotifs,
              },
              {
                key: "course_update_alerts",
                label: "Course Update Alerts",
                desc: "Notify when enrolled courses are updated",
                value: courseUpdateAlerts,
                setter: setCourseUpdateAlerts,
              },
              {
                key: "achievement_alerts",
                label: "Achievement Alerts",
                desc: "Celebrate when you earn new achievements",
                value: achievementAlerts,
                setter: setAchievementAlerts,
              },
              {
                key: "weekly_digest",
                label: "Weekly Digest",
                desc: "Receive a weekly summary of your activity",
                value: weeklyDigest,
                setter: setWeeklyDigest,
              },
            ] as const
          ).map((item, idx) => (
            <div key={item.key}>
              {idx > 0 && <Separator className="mb-5" />}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">{item.label}</Label>
                  <p className="text-muted-foreground text-xs">{item.desc}</p>
                </div>
                <Switch
                  checked={item.value}
                  onCheckedChange={(v) => {
                    item.setter(v);
                    updateSetting(item.key, v);
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 3. Learning Preferences */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500">
              <BookOpen className="h-4 w-4 text-white" />
            </div>
            Learning Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Daily Goal */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Daily Learning Goal</Label>
              <p className="text-muted-foreground text-xs">Target minutes of learning per day</p>
            </div>
            <Select
              value={dailyGoal}
              onValueChange={(v) => {
                setDailyGoal(v);
                updateSetting("daily_goal", v);
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="45">45 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
                <SelectItem value="90">90 min</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Study Timer */}
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Default Study Timer</Label>
              <p className="text-muted-foreground text-xs">
                Pomodoro timer duration for study sessions
              </p>
            </div>
            <Select
              value={studyTimer}
              onValueChange={(v) => {
                setStudyTimer(v);
                updateSetting("study_timer", v);
              }}
            >
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="25">25 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="45">45 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Auto-play Next */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Auto-play Next Lesson</Label>
              <p className="text-muted-foreground text-xs">
                Automatically advance to the next lesson
              </p>
            </div>
            <Switch
              checked={autoPlayNext}
              onCheckedChange={(v) => {
                setAutoPlayNext(v);
                updateSetting("auto_play_next", v);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 4. Privacy */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500">
              <Shield className="h-4 w-4 text-white" />
            </div>
            Privacy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Show Profile Publicly */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Show Profile Publicly</Label>
              <p className="text-muted-foreground text-xs">
                Allow others to see your profile and stats
              </p>
            </div>
            <Switch
              checked={showProfilePublicly}
              onCheckedChange={(v) => {
                setShowProfilePublicly(v);
                updateSetting("show_profile_publicly", v);
              }}
            />
          </div>

          <Separator />

          {/* Show Learning Activity */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Show Learning Activity</Label>
              <p className="text-muted-foreground text-xs">
                Display your learning progress on your profile
              </p>
            </div>
            <Switch
              checked={showLearningActivity}
              onCheckedChange={(v) => {
                setShowLearningActivity(v);
                updateSetting("show_learning_activity", v);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 5. Data */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-red-500">
              <Database className="h-4 w-4 text-white" />
            </div>
            Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Clear Search History</p>
              <p className="text-muted-foreground text-xs">Remove all recent search entries</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSearchHistory}
              className="shrink-0"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Clear
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Reset Tour</p>
              <p className="text-muted-foreground text-xs">
                Show the onboarding tour again on next visit
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleResetTour} className="shrink-0">
              <RotateCcw className="mr-2 h-3.5 w-3.5" />
              Reset
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Dismiss All Announcements</p>
              <p className="text-muted-foreground text-xs">
                Restore all previously dismissed announcements
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismissAnnouncements}
              className="shrink-0"
            >
              <XCircle className="mr-2 h-3.5 w-3.5" />
              Restore
            </Button>
          </div>

          <Separator />

          <AlertDialog>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-0.5">
                <p className="text-destructive text-sm font-medium">Clear All Local Data</p>
                <p className="text-muted-foreground text-xs">
                  Remove all Ecotech data stored on this device
                </p>
              </div>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="shrink-0">
                  <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
            </div>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all Ecotech data stored on this device, including
                  your preferences, search history, onboarding progress, and dismissed
                  announcements. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleClearAll}>Yes, clear all data</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* 6. About */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-gray-600">
              <Info className="h-4 w-4 text-white" />
            </div>
            About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Version</p>
            <p className="text-muted-foreground text-sm">v2.0.0</p>
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-sm font-medium">Built With</p>
            <div className="flex flex-wrap gap-2">
              {["Next.js", "TypeScript", "Tailwind CSS"].map((tech) => (
                <span
                  key={tech}
                  className="border-border/50 bg-muted/50 text-muted-foreground rounded-md border px-2.5 py-1 text-xs font-medium"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-sm font-medium">Resources</p>
            <div className="space-y-2">
              {[
                { label: "Help Center", href: "#" },
                { label: "Documentation", href: "#" },
                { label: "Feedback", href: "#" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={(e) => e.preventDefault()}
                  className="text-muted-foreground hover:text-primary flex items-center gap-2 text-sm transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
