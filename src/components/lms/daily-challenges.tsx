"use client";

import { useState, useEffect } from "react";
import {
  Zap,
  BookOpenCheck,
  ClipboardCheck,
  Timer,
  MessageSquarePlus,
  Star,
  Bookmark,
  LayoutDashboard,
  FileText,
  Check,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ------------------------------------------------------------------
//  Types
// ------------------------------------------------------------------

interface Challenge {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  type: string;
  icon: string;
  completed: boolean;
  progressText: string;
}

interface ChallengesData {
  challenges: Challenge[];
  date: string;
  completedCount: number;
  totalCount: number;
  totalXpAvailable: number;
  totalXpEarned: number;
}

// ------------------------------------------------------------------
//  Icon mapping
// ------------------------------------------------------------------

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpenCheck,
  ClipboardCheck,
  Timer,
  MessageSquarePlus,
  Star,
  Bookmark,
  LayoutDashboard,
  FileText,
};

// ------------------------------------------------------------------
//  Gradient colors per challenge type (no blue/indigo)
// ------------------------------------------------------------------

const GRADIENT_MAP: Record<string, string> = {
  complete_lesson: "from-teal-500 to-emerald-500",
  take_quiz: "from-cyan-500 to-teal-500",
  study_15min: "from-amber-500 to-orange-500",
  leave_comment: "from-emerald-500 to-green-500",
  rate_course: "from-yellow-500 to-amber-500",
  bookmark_course: "from-rose-500 to-pink-500",
  view_dashboard: "from-cyan-500 to-emerald-500",
  read_notes: "from-teal-500 to-cyan-500",
};

// ------------------------------------------------------------------
//  Loading skeleton
// ------------------------------------------------------------------

function ChallengesSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-border/50 w-64 shrink-0 rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
//  Challenge Card
// ------------------------------------------------------------------

function ChallengeCard({ challenge }: { challenge: Challenge }) {
  const Icon = ICON_MAP[challenge.icon] || BookOpenCheck;
  const gradient = GRADIENT_MAP[challenge.type] || "from-teal-500 to-emerald-500";

  return (
    <div
      className={cn(
        "glass-card hover-lift group relative w-64 shrink-0 rounded-xl border p-4 transition-all duration-200",
        challenge.completed ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/50 bg-card",
      )}
    >
      {/* Completion overlay checkmark */}
      {challenge.completed && (
        <div className="absolute top-3 right-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/30">
            <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Icon in gradient circle */}
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-transform duration-200 group-hover:scale-110",
            `bg-gradient-to-br ${gradient}`,
            challenge.completed ? "opacity-60" : "",
          )}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>

        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "text-sm leading-tight font-semibold",
              challenge.completed ? "text-muted-foreground line-through" : "text-foreground",
            )}
          >
            {challenge.title}
          </h3>
          <p
            className={cn(
              "mt-1 line-clamp-2 text-xs leading-relaxed",
              challenge.completed ? "text-muted-foreground/60" : "text-muted-foreground",
            )}
          >
            {challenge.description}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {/* XP badge */}
            <Badge
              className={cn(
                "gap-1 border-0 text-[11px] font-bold",
                challenge.completed
                  ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                  : "bg-gradient-to-r from-teal-500/15 to-emerald-500/15 text-teal-700 dark:text-teal-400",
              )}
            >
              +{challenge.xpReward} XP
            </Badge>
          </div>
          {/* Progress text */}
          <p
            className={cn(
              "mt-1.5 text-[11px]",
              challenge.completed
                ? "font-medium text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground",
            )}
          >
            {challenge.progressText}
          </p>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
//  DailyChallenges component
// ------------------------------------------------------------------

export function DailyChallenges() {
  const [data, setData] = useState<ChallengesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchChallenges() {
      try {
        const res = await fetch("/api/challenges");
        const json = await res.json();
        if (!cancelled && json.success) {
          setData(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch challenges", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchChallenges();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !data) {
    return <ChallengesSkeleton />;
  }

  return (
    <div className="content-reveal space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <h2 className="text-foreground text-sm font-semibold">Daily Challenges</h2>
        <Badge
          variant="secondary"
          className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 text-[11px] font-medium text-amber-700 dark:text-amber-400"
        >
          Today
        </Badge>
        {/* Completion counter */}
        <span className="text-muted-foreground ml-auto text-xs">
          {data.completedCount}/{data.totalCount} completed
        </span>
      </div>

      {/* Horizontal scrollable challenge cards */}
      <div className="custom-scrollbar flex gap-3 overflow-x-auto pb-2">
        {data.challenges.map((challenge) => (
          <ChallengeCard key={challenge.id} challenge={challenge} />
        ))}
      </div>

      {/* XP summary */}
      <div className="text-muted-foreground flex items-center gap-3 text-xs">
        <span>
          <span className="text-foreground font-semibold">{data.totalXpEarned}</span> /{" "}
          {data.totalXpAvailable} XP earned today
        </span>
        <div className="bg-muted/60 h-3 flex-1 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-700"
            style={{
              width: `${data.totalXpAvailable > 0 ? (data.totalXpEarned / data.totalXpAvailable) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
