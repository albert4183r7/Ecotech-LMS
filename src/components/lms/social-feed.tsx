"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, CheckCircle2, BookOpen, MessageSquare, Trophy, Star, Flame } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

interface SocialActivityItem {
  id: string;
  userName: string;
  userAvatar: string;
  userRole: string;
  action:
    | "completed_lesson"
    | "enrolled_course"
    | "posted_comment"
    | "earned_badge"
    | "rated_course"
    | "started_streak";
  targetTitle: string;
  targetType: string;
  timestamp: string;
  xpEarned: number | null;
}

// ─────────────────────────────────────────────────────
// Action type config
// ─────────────────────────────────────────────────────

const ACTION_CONFIG: Record<
  SocialActivityItem["action"],
  {
    icon: React.ElementType;
    colorClass: string;
    borderColor: string;
    label: string;
  }
> = {
  completed_lesson: {
    icon: CheckCircle2,
    colorClass: "text-emerald-500 dark:text-emerald-400",
    borderColor: "border-l-emerald-500 dark:border-l-emerald-400",
    label: "completed a lesson in",
  },
  enrolled_course: {
    icon: BookOpen,
    colorClass: "text-teal-500 dark:text-teal-400",
    borderColor: "border-l-teal-500 dark:border-l-teal-400",
    label: "enrolled in",
  },
  posted_comment: {
    icon: MessageSquare,
    colorClass: "text-cyan-500 dark:text-cyan-400",
    borderColor: "border-l-cyan-500 dark:border-l-cyan-400",
    label: "commented on",
  },
  earned_badge: {
    icon: Trophy,
    colorClass: "text-amber-500 dark:text-amber-400",
    borderColor: "border-l-amber-500 dark:border-l-amber-400",
    label: "earned the",
  },
  rated_course: {
    icon: Star,
    colorClass: "text-yellow-500 dark:text-yellow-400",
    borderColor: "border-l-yellow-500 dark:border-l-yellow-400",
    label: "rated",
  },
  started_streak: {
    icon: Flame,
    colorClass: "text-orange-500 dark:text-orange-400",
    borderColor: "border-l-orange-500 dark:border-l-orange-400",
    label: "started a",
  },
};

// ─────────────────────────────────────────────────────
// Avatar gradient palette
// ─────────────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  "from-cyan-500 to-teal-500",
  "from-emerald-500 to-cyan-500",
  "from-teal-500 to-emerald-600",
  "from-amber-500 to-orange-500",
  "from-cyan-400 to-emerald-500",
  "from-teal-400 to-cyan-600",
  "from-emerald-400 to-teal-600",
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

// ─────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────

function FeedSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3.5 w-full max-w-[220px]" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────

export function SocialFeed({ userId }: { userId: string }) {
  const [activities, setActivities] = useState<SocialActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/social-feed?userId=${encodeURIComponent(userId)}&limit=10`);
      const json = await res.json();
      if (json.success) {
        setActivities(json.data as SocialActivityItem[]);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  return (
    <div className="glass-card border-border bg-card/80 overflow-hidden rounded-xl border">
      {/* ─── Header ─── */}
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-500">
            <Users className="h-4 w-4 text-white" />
          </div>
          <h2 className="text-foreground text-sm font-semibold">Community Activity</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Live
          </span>
        </div>
      </div>

      {/* ─── Feed Items ─── */}
      <div className="custom-scrollbar max-h-96 overflow-y-auto">
        {loading ? (
          <FeedSkeleton />
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <div className="bg-muted mb-2 flex h-10 w-10 items-center justify-center rounded-full">
              <Users className="text-muted-foreground h-5 w-5" />
            </div>
            <p className="text-muted-foreground text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="divide-border/50 divide-y">
            {activities.map((item, idx) => {
              const config = ACTION_CONFIG[item.action];
              const IconComp = config.icon;
              const gradient = getGradient(item.userName);

              return (
                <div
                  key={item.id}
                  className={cn(
                    "content-reveal hover:bg-muted/30 flex items-start gap-3 border-l-2 px-4 py-3 transition-all duration-200",
                    config.borderColor,
                  )}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  {/* Type Icon */}
                  <div
                    className={cn(
                      "bg-muted/60 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                      config.colorClass,
                    )}
                  >
                    <IconComp className="h-3.5 w-3.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <Avatar className="h-5 w-5 shrink-0">
                        <AvatarFallback
                          className={cn(
                            "bg-gradient-to-br text-[9px] font-semibold text-white",
                            gradient,
                          )}
                        >
                          {item.userAvatar}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-foreground truncate text-xs font-semibold">
                        {item.userName}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      <span className="text-foreground/80 font-medium">{config.label}</span>{" "}
                      <span className="text-foreground font-medium">{item.targetTitle}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-muted-foreground/70 text-[11px]">{item.timestamp}</span>
                      {item.xpEarned !== null && item.xpEarned > 0 && (
                        <Badge
                          variant="secondary"
                          className="h-4 border-0 bg-teal-500/10 px-1.5 text-[10px] font-semibold text-teal-600 dark:text-teal-400"
                        >
                          +{item.xpEarned} XP
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
