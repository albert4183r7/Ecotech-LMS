"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Trophy,
  Medal,
  Award,
  Crown,
  BookOpen,
  ArrowRight,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  department: string;
  completedCourses: number;
  avgProgress: number;
  score: number;
  isCurrentUser: boolean;
}

interface LeaderboardResponse {
  success: boolean;
  data: LeaderboardEntry[];
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatXp(score: number): string {
  return score.toLocaleString();
}

/** Map rank to medal icon and styling */
function getMedalConfig(
  rank: number
): { icon: React.ElementType; label: string; className: string } | null {
  switch (rank) {
    case 1:
      return {
        icon: Trophy,
        label: "Gold",
        className:
          "text-amber-500 drop-shadow-sm",
      };
    case 2:
      return {
        icon: Medal,
        label: "Silver",
        className:
          "text-slate-400 drop-shadow-sm",
      };
    case 3:
      return {
        icon: Award,
        label: "Bronze",
        className:
          "text-amber-700 dark:text-amber-600 drop-shadow-sm",
      };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function LeaderboardSkeleton() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border/30 p-3"
            >
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-1.5 w-full max-w-[140px] rounded-full" />
              </div>
              <div className="flex flex-col items-end gap-1">
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-14" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500">
            <Trophy className="h-4 w-4 text-white" aria-hidden="true" />
          </div>
          Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">
            No leaderboard data yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Complete courses to climb the ranks!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  XP Progress Bar (gradient fill)                                    */
/* ------------------------------------------------------------------ */

function XpProgressBar({ value }: { value: number }) {
  return (
    <Progress
      value={value}
      className="h-1.5 w-full max-w-[140px] [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-cyan-500 [&_[data-slot=progress-indicator]]:to-teal-500"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Leaderboard Entry Row                                              */
/* ------------------------------------------------------------------ */

function LeaderboardRow({
  entry,
  maxScore,
  index,
}: {
  entry: LeaderboardEntry;
  maxScore: number;
  index: number;
}) {
  const medal = getMedalConfig(entry.rank);
  const isCurrentUser = entry.isCurrentUser;

  return (
    <div
      className={
        "flex items-center gap-3 rounded-xl border p-3 transition-all duration-200 " +
        (isCurrentUser
          ? "border-primary/30 bg-gradient-to-r from-cyan-500/8 to-teal-500/8 shadow-sm ring-1 ring-primary/10"
          : entry.rank <= 3
            ? "border-border/40 bg-muted/30"
            : "border-border/20 hover:border-border/40 hover:bg-muted/20")
      }
      style={{
        animation: "leaderboardFadeIn 0.4s ease-out forwards",
        animationDelay: `${index * 60}ms`,
        opacity: 0,
      }}
      role="listitem"
      aria-label={`${entry.name}, rank ${entry.rank}, ${entry.completedCourses} courses, ${formatXp(entry.score)} XP`}
    >
      {/* Rank / Crown */}
      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
        {entry.rank === 1 ? (
          <Crown
            className="h-5 w-5 text-amber-500"
            aria-label="1st place"
          />
        ) : (
          <span
            className={
              "text-xs font-bold tabular-nums " +
              (entry.rank <= 3
                ? "text-foreground"
                : "text-muted-foreground")
            }
          >
            {entry.rank}
          </span>
        )}
      </div>

      {/* Avatar */}
      <Avatar
        className={
          "h-9 w-9 text-xs font-semibold " +
          (entry.rank === 1
            ? "ring-2 ring-amber-500/60"
            : entry.rank === 2
              ? "ring-2 ring-slate-400/50"
              : entry.rank === 3
                ? "ring-2 ring-amber-700/40"
              : "")
        }
      >
        <AvatarFallback
          className={
            entry.rank === 1
              ? "bg-gradient-to-br from-amber-400 to-amber-600 text-white"
              : entry.rank === 2
                ? "bg-gradient-to-br from-slate-300 to-slate-500 text-white"
                : entry.rank === 3
                  ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white"
                  : isCurrentUser
                    ? "bg-gradient-to-br from-cyan-500 to-teal-500 text-white"
                    : "bg-muted text-muted-foreground"
          }
        >
          {getInitials(entry.name)}
        </AvatarFallback>
      </Avatar>

      {/* Name + XP bar */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p
            className={
              "truncate text-sm font-medium leading-tight " +
              (isCurrentUser
                ? "text-foreground"
                : "text-foreground/90")
            }
          >
            {entry.name}
            {isCurrentUser && (
              <span className="ml-1.5 text-[10px] font-normal text-primary">
                (you)
              </span>
            )}
          </p>
          {medal && (
            <medal.icon
              className={"h-3.5 w-3.5 shrink-0 " + medal.className}
              aria-label={`${medal.label} medal`}
            />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <XpProgressBar value={entry.avgProgress} />
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {entry.avgProgress}%
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <div className="flex items-center gap-1">
          <BookOpen
            className="h-3 w-3 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="text-xs font-medium tabular-nums text-foreground/80">
            {entry.completedCourses}
          </span>
        </div>
        <span className="text-[11px] font-semibold tabular-nums text-primary">
          {formatXp(entry.score)} XP
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Keyframes (injected once)                                          */
/* ------------------------------------------------------------------ */

const KEYFRAMES_STYLE = `
@keyframes leaderboardFadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function LeaderboardWidget() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch("/api/leaderboard");
        const json: LeaderboardResponse = await res.json();
        if (json.success && json.data?.length > 0) {
          // Take top 10
          setEntries(json.data.slice(0, 10));
        } else {
          setEntries([]);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchLeaderboard();
  }, []);

  if (loading) {
    return <LeaderboardSkeleton />;
  }

  if (error || entries.length === 0) {
    return <EmptyState />;
  }

  const topScore = Math.max(...entries.map((e) => e.score), 1);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES_STYLE }} />
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500">
                <Trophy className="h-4 w-4 text-white" aria-hidden="true" />
              </div>
              Leaderboard
            </CardTitle>
            <Badge
              variant="secondary"
              className="gap-1 bg-gradient-to-r from-cyan-600/10 to-teal-500/10 text-xs font-medium text-cyan-700 dark:text-cyan-400"
            >
              <Users className="h-3 w-3" aria-hidden="true" />
              Top {entries.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[440px] pr-1">
            <div
              className="space-y-2"
              role="list"
              aria-label="Leaderboard rankings"
            >
              {entries.map((entry, i) => (
                <LeaderboardRow
                  key={entry.id}
                  entry={entry}
                  maxScore={topScore}
                  index={i}
                />
              ))}
            </div>
          </ScrollArea>

          {/* View All link */}
          <div className="mt-4 border-t border-border/40 pt-3">
            <Link
              href="/leaderboard"
              className="group flex items-center justify-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
            >
              View full leaderboard
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}