"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Medal, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

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

/* ------------------------------------------------------------------ */
/*  Medal badge for top-3 ranks                                       */
/* ------------------------------------------------------------------ */
export function RankBadge({ rank }: { rank: number }) {
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
    <div className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold">
      {rank}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Leaderboard Skeleton                                              */
/* ------------------------------------------------------------------ */
export function LeaderboardSkeleton() {
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
export function TeamLeaderboardCard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const res = await fetch("/api/leaderboard");
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
              .split(" ")
              .map((w) => w.charAt(0).toUpperCase())
              .slice(0, 2)
              .join("");

            return (
              <div
                key={entry.id}
                className={`group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 ${
                  isMe ? "bg-primary/5 ring-primary/15 ring-1" : "hover:bg-muted/50"
                }`}
              >
                {/* Rank badge */}
                <RankBadge rank={entry.rank} />

                {/* Avatar */}
                <Avatar className="border-border/50 h-8 w-8 border">
                  <AvatarFallback
                    className={`text-xs font-semibold ${
                      isMe
                        ? "bg-gradient-to-br from-cyan-600 to-teal-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>

                {/* Name + Department */}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-tight font-medium ${
                      isMe ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {entry.name}
                    {isMe && (
                      <span className="text-muted-foreground ml-1.5 text-[10px] font-normal">
                        (You)
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">{entry.department}</p>
                </div>

                {/* Score */}
                <div className="text-right">
                  <p
                    className={`text-sm font-bold tabular-nums ${
                      isMe ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {entry.score.toLocaleString()}
                  </p>
                  <p className="text-muted-foreground text-[10px]">pts</p>
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
