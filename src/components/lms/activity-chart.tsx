"use client";

import { useEffect, useState } from "react";
import { Flame, BarChart3, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DayEntry {
  day: string;
  date: string;
  minutes: number;
}

interface ActivityData {
  weeklyData: DayEntry[];
  streak: { current: number; longest: number };
  totalMinutes: number;
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function ActivityChartSkeleton() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2" style={{ height: 120 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <Skeleton
                className="w-full rounded-t-md"
                style={{ height: `${30 + Math.random() * 70}%` }}
              />
              <Skeleton className="h-3 w-7" />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Single Bar                                                         */
/* ------------------------------------------------------------------ */

function ActivityBar({
  entry,
  maxMinutes,
  isToday,
}: {
  entry: DayEntry;
  maxMinutes: number;
  isToday: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const minutes = entry.minutes;
  const hasActivity = minutes > 0;

  // Height percentage (minimum 4px for visual presence when there's activity)
  const heightPercent =
    maxMinutes > 0 && hasActivity ? Math.max(8, (minutes / maxMinutes) * 100) : 0;

  // Color intensity based on relative activity
  const intensity = maxMinutes > 0 ? minutes / maxMinutes : 0;

  return (
    <div className="group flex flex-1 flex-col items-center gap-1.5">
      {/* Tooltip */}
      {hovered && hasActivity && (
        <div className="bg-foreground text-background animate-in fade-in-0 zoom-in-95 absolute -top-8 left-1/2 z-10 -translate-x-1/2 rounded-md px-2 py-1 text-[10px] font-medium whitespace-nowrap shadow-md duration-100">
          {minutes} min
          {/* Tooltip arrow */}
          <div className="bg-foreground absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45" />
        </div>
      )}

      {/* Bar container */}
      <div
        className="relative w-full"
        style={{ height: 120 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="img"
        aria-label={`${entry.day}: ${minutes} minutes of learning`}
      >
        <div className="flex h-full w-full items-end justify-center">
          <div
            className={
              "w-full max-w-[40px] rounded-t-md transition-all duration-300 ease-out " +
              (hovered && hasActivity ? "scale-105 brightness-110" : "")
            }
            style={{
              height: `${heightPercent}%`,
              minHeight: hasActivity ? "6px" : "2px",
              background: hasActivity
                ? `linear-gradient(to top, oklch(0.7 0.15 180), oklch(${0.6 + intensity * 0.2} ${0.12 + intensity * 0.1} ${190 + intensity * 20}))`
                : undefined,
              backgroundColor: !hasActivity ? "oklch(0.85 0.01 250 / 0.4)" : undefined,
            }}
          />
        </div>
      </div>

      {/* Day label */}
      <div className="relative flex flex-col items-center">
        <span
          className={
            "text-[11px] leading-none font-medium " +
            (isToday ? "text-primary" : hasActivity ? "text-foreground" : "text-muted-foreground")
          }
        >
          {entry.day}
        </span>
        {isToday && (
          <div className="bg-primary shadow-primary/50 mt-1 h-1.5 w-1.5 rounded-full shadow-sm" />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function ActivityChart() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchActivity() {
      try {
        const res = await fetch("/api/activity?weeks=12");
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    fetchActivity();
  }, []);

  if (loading || !data) {
    return <ActivityChartSkeleton />;
  }

  const { weeklyData, streak, totalMinutes } = data;
  const maxMinutes = Math.max(...weeklyData.map((d) => d.minutes), 1);

  // Determine today's day label
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "short" });

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500">
              <BarChart3 className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            This Week
          </CardTitle>
          {streak.current > 0 ? (
            <Badge
              variant="secondary"
              className="gap-1.5 bg-gradient-to-r from-orange-500/10 to-amber-500/10 text-xs font-semibold text-orange-600 dark:text-orange-400"
            >
              <span
                className="inline-block"
                role="img"
                aria-label="fire"
                style={{
                  animation: "pulse 1.5s ease-in-out infinite",
                  display: "inline-flex",
                }}
              >
                🔥
              </span>
              {streak.current} day streak
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {/* Bar chart */}
        <div className="flex items-end justify-between gap-2 px-1">
          {weeklyData.map((entry) => (
            <ActivityBar
              key={entry.date}
              entry={entry}
              maxMinutes={maxMinutes}
              isToday={entry.day === todayLabel}
            />
          ))}
        </div>

        {/* Summary footer */}
        <div className="border-border/40 mt-4 flex items-center justify-between border-t pt-3">
          <div className="text-muted-foreground flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-xs font-medium">
              {totalMinutes > 0 ? `${totalMinutes} min total this week` : "No activity this week"}
            </span>
          </div>
          {streak.longest > 0 && (
            <span className="text-muted-foreground text-[11px]">
              <Flame className="mr-0.5 inline h-3 w-3" aria-hidden="true" />
              Best: {streak.longest} days
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
