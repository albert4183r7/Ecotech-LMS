"use client";

import { useState, useEffect, useRef } from "react";
import { Zap, TrendingUp, BookOpen, MessageSquare, Star, Clock, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------
//  Types
// ------------------------------------------------------------------

interface XpHistoryEntry {
  date: string;
  xp: number;
  reason: string;
  type: string;
}

interface XpData {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  xpHistory: XpHistoryEntry[];
  levelTitle: string;
  progressPercent: number;
}

// ------------------------------------------------------------------
//  History type → icon mapping
// ------------------------------------------------------------------

const TYPE_ICONS: Record<string, React.ElementType> = {
  lesson: BookOpen,
  quiz: Award,
  study: Clock,
  comment: MessageSquare,
  rating: Star,
  streak: TrendingUp,
  bookmark: Star,
  other: Zap,
};

// ------------------------------------------------------------------
//  Compact XP Bar (for navbar)
// ------------------------------------------------------------------

export function XpBarCompact({ userId = "user_demo_001" }: { userId?: string }) {
  const [data, setData] = useState<XpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);
  const prevLevel = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchXp() {
      try {
        const res = await fetch(`/api/xp?userId=${userId}`);
        const json = await res.json();
        if (!cancelled && json.success) {
          setData(json.data);
          // Detect level up
          if (prevLevel.current !== null && json.data.level > prevLevel.current) {
            setFlash(true);
            setTimeout(() => setFlash(false), 1200);
          }
          prevLevel.current = json.data.level;
        }
      } catch (err) {
        console.error("Failed to fetch XP", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchXp();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading || !data) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-4 w-10 rounded" />
        <Skeleton className="h-2 w-24 rounded-full" />
      </div>
    );
  }

  const xpInLevel = data.totalXp - data.currentLevelXp;
  const xpNeeded = data.nextLevelXp - data.currentLevelXp;

  return (
    <div
      className={cn(
        "flex items-center gap-2 transition-transform duration-300",
        flash && "scale-105"
      )}
      title={`Level ${data.level} — ${data.levelTitle}: ${data.totalXp} XP`}
    >
      <Badge
        className={cn(
          "h-5 shrink-0 gap-1 border-0 px-1.5 text-[11px] font-bold text-white shadow-sm",
          "bg-gradient-to-r from-teal-500 to-emerald-500",
          flash && "animate-[badge-pulse_0.6s_ease-in-out_2]"
        )}
      >
        <Zap className="h-3 w-3" />
        Lv.{data.level}
      </Badge>
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            "bg-gradient-to-r from-teal-500 to-emerald-500"
          )}
          style={{ width: `${data.progressPercent}%` }}
        />
        {/* Green flash on XP gain */}
        {flash && (
          <div className="xp-flash absolute inset-0 rounded-full bg-emerald-400/40" />
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
//  Full XP Bar (for profile page)
// ------------------------------------------------------------------

export function XpBarFull({ userId = "user_demo_001" }: { userId?: string }) {
  const [data, setData] = useState<XpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);
  const prevLevel = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchXp() {
      try {
        const res = await fetch(`/api/xp?userId=${userId}`);
        const json = await res.json();
        if (!cancelled && json.success) {
          setData(json.data);
          if (prevLevel.current !== null && json.data.level > prevLevel.current) {
            setFlash(true);
            setTimeout(() => setFlash(false), 1500);
          }
          prevLevel.current = json.data.level;
        }
      } catch (err) {
        console.error("Failed to fetch XP", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchXp();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading || !data) {
    return <XpBarFullSkeleton />;
  }

  const xpInLevel = data.totalXp - data.currentLevelXp;
  const xpNeeded = data.nextLevelXp - data.currentLevelXp;

  return (
    <div
      className={cn(
        "glass-card content-reveal overflow-hidden rounded-xl border border-border/50",
        flash && "ring-2 ring-emerald-500/40"
      )}
    >
      {/* Top section with level badge and XP display */}
      <div className="relative bg-gradient-to-r from-teal-500/5 via-emerald-500/5 to-cyan-500/5 px-5 py-5">
        <div className="flex items-center gap-3">
          {/* Level badge */}
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-500/20 transition-transform duration-300",
              flash && "scale-110"
            )}
          >
            <Zap className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge className="border-0 bg-gradient-to-r from-teal-500 to-emerald-500 text-xs font-bold text-white shadow-sm">
                Level {data.level}
              </Badge>
              <Badge
                variant="secondary"
                className="bg-teal-500/10 text-xs font-medium text-teal-700 dark:text-teal-400"
              >
                {data.levelTitle}
              </Badge>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-extrabold tabular-nums text-foreground">
                {data.totalXp.toLocaleString()}
              </span>
              <span className="text-sm font-semibold text-teal-600 dark:text-teal-400">
                XP
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar section */}
      <div className="px-5 pb-4 pt-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-muted-foreground">
              Level {data.level}
            </span>
            <span className="font-medium text-muted-foreground">
              {data.level < 10 ? `Level ${data.level + 1}` : "Max Level"}
            </span>
          </div>
          <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-out",
                "bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500"
              )}
              style={{ width: `${data.progressPercent}%` }}
            />
            {/* Flash overlay */}
            {flash && (
              <div className="xp-flash absolute inset-0 rounded-full bg-emerald-400/30" />
            )}
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            {xpInLevel} / {xpNeeded} XP to next level
          </p>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">
              {data.level}
            </p>
            <p className="text-[10px] font-medium text-muted-foreground">
              Current Level
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">
              {data.progressPercent}%
            </p>
            <p className="text-[10px] font-medium text-muted-foreground">
              Progress
            </p>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
            <p className="text-lg font-bold tabular-nums text-foreground">
              {data.level < 10 ? data.nextLevelXp - data.totalXp : 0}
            </p>
            <p className="text-[10px] font-medium text-muted-foreground">
              XP Needed
            </p>
          </div>
        </div>
      </div>

      {/* XP History */}
      <div className="border-t border-border/50 px-5 py-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent XP Activity
        </h3>
        <div className="space-y-2.5">
          {data.xpHistory.map((entry, i) => {
            const Icon = TYPE_ICONS[entry.type] || Zap;
            const dateLabel = new Date(entry.date + "T00:00:00").toLocaleDateString(
              "en-US",
              { weekday: "short", month: "short", day: "numeric" }
            );
            return (
              <div
                key={`${entry.date}-${i}`}
                className="flex items-center gap-3"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/10">
                  <Icon className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {entry.reason}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {dateLabel}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "shrink-0 border-0 bg-teal-500/10 text-[11px] font-bold",
                    "text-teal-700 dark:text-teal-400"
                  )}
                >
                  +{entry.xp} XP
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
//  Full XP bar skeleton
// ------------------------------------------------------------------

function XpBarFullSkeleton() {
  return (
    <div className="glass-card overflow-hidden rounded-xl border border-border/50">
      <div className="bg-muted/20 px-5 py-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
      </div>
      <div className="px-5 pb-4 pt-3">
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="mx-auto h-3 w-28" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg bg-muted/40 px-3 py-2 text-center"
            >
              <Skeleton className="mx-auto mb-1 h-5 w-10" />
              <Skeleton className="mx-auto h-2.5 w-16" />
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border/50 px-5 py-4">
        <Skeleton className="mb-3 h-3 w-28" />
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
