"use client";

import {
  Award,
  Star,
  BookOpen,
  Target,
  Flame,
  Compass,
  Zap,
  Shield,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AchievementData {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: boolean;
}

interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  earned: boolean;
}

interface AchievementBadgesProps {
  stats: {
    totalCourses: number;
    inProgress: number;
    completed: number;
    avgProgress: number;
    favoritesCount: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Icon mapper                                                        */
/* ------------------------------------------------------------------ */

const ICON_MAP: Record<string, React.ElementType> = {
  Award,
  Star,
  BookOpen,
  Target,
  Flame,
  Compass,
  Zap,
  Shield,
};

/* ------------------------------------------------------------------ */
/*  Compute achievements from stats                                    */
/* ------------------------------------------------------------------ */

function computeAchievements(
  stats: AchievementBadgesProps["stats"],
  apiAchievements: AchievementData[] | null
): AchievementBadge[] {
  // If we have API achievements, merge with computed local ones
  const baseBadges: AchievementBadge[] = [
    {
      id: "first-step",
      name: "First Step",
      description: "Enrolled in your first course",
      icon: Zap,
      earned: stats.totalCourses > 0,
    },
    {
      id: "quick-learner",
      name: "Quick Learner",
      description: "Completed your first course",
      icon: Star,
      earned: stats.completed > 0,
    },
    {
      id: "dedicated",
      name: "Dedicated",
      description: "Completed 3 or more courses",
      icon: BookOpen,
      earned: stats.completed >= 3,
    },
    {
      id: "scholar",
      name: "Scholar",
      description: "Completed 5 or more courses",
      icon: Award,
      earned: stats.completed >= 5,
    },
    {
      id: "perfectionist",
      name: "Perfectionist",
      description: "Achieved 100% progress on any course",
      icon: Target,
      earned: false, // Computed on server / API
    },
    {
      id: "explorer",
      name: "Explorer",
      description: "Enrolled in courses from 3+ categories",
      icon: Compass,
      earned: false, // Computed on server / API
    },
    {
      id: "streak-keeper",
      name: "Streak Keeper",
      description: "Maintained weekly learning activity",
      icon: Flame,
      earned: false, // Mock for now
    },
  ];

  // If API returned achievements, use their earned state for server-computed ones
  if (apiAchievements) {
    for (const badge of baseBadges) {
      const match = apiAchievements.find((a) => a.id === badge.id);
      if (match) {
        badge.earned = match.earned;
      }
    }
  }

  return baseBadges;
}

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function AchievementsSkeleton() {
  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5 rounded" />
          <Skeleton className="h-5 w-36" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 rounded-xl border border-border/30 p-4"
            >
              <Skeleton className="h-10 w-10 rounded-xl" />
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-2.5 w-28" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Single Badge                                                       */
/* ------------------------------------------------------------------ */

function BadgeCard({ badge }: { badge: AchievementBadge }) {
  const IconComponent = badge.icon;

  return (
    <div
      className={`group relative flex flex-col items-center gap-2.5 rounded-xl border p-4 text-center transition-all duration-200 ${
        badge.earned
          ? "border-primary/20 bg-gradient-to-b from-primary/5 to-transparent shadow-sm hover:border-primary/40 hover:shadow-md card-gradient-border"
          : "border-border/30 bg-muted/20 opacity-50 grayscale"
      }`}
      role="listitem"
      aria-label={
        badge.earned
          ? `Achievement earned: ${badge.name} — ${badge.description}`
          : `Achievement locked: ${badge.name} — ${badge.description}`
      }
    >
      {/* Icon */}
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110 ${
          badge.earned
            ? "bg-gradient-to-br from-cyan-500 to-teal-500 text-white shadow-sm"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {badge.earned ? (
          <IconComponent className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Lock className="h-4 w-4" aria-hidden="true" />
        )}
      </div>

      {/* Name */}
      <p
        className={`text-xs font-semibold leading-tight ${
          badge.earned ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {badge.name}
      </p>

      {/* Description */}
      <p className="text-[10px] leading-tight text-muted-foreground">
        {badge.description}
      </p>

      {/* Earned checkmark */}
      {badge.earned && (
        <div className="absolute top-2 right-2">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600">
            <svg
              className="h-2.5 w-2.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AchievementBadges({ stats }: AchievementBadgesProps) {
  const [achievements, setAchievements] = useState<AchievementBadge[]>([]);
  const [apiAchievements, setApiAchievements] =
    useState<AchievementData[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAchievements() {
      try {
        const res = await fetch("/api/achievements");
        const json = await res.json();
        if (json.success) {
          setApiAchievements(json.data);
        }
      } catch {
        /* silent — fall back to client-side computation */
      } finally {
        setLoading(false);
      }
    }
    fetchAchievements();
  }, []);

  useEffect(() => {
    setAchievements(computeAchievements(stats, apiAchievements));
  }, [stats, apiAchievements]);

  const earnedCount = achievements.filter((a) => a.earned).length;

  if (loading) {
    return <AchievementsSkeleton />;
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500">
              <Award className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
            Achievements
          </CardTitle>
          <Badge
            variant="secondary"
            className="gap-1 bg-gradient-to-r from-cyan-600/10 to-teal-500/10 text-xs font-medium text-cyan-700 dark:text-cyan-400"
          >
            <Shield className="h-3 w-3" aria-hidden="true" />
            {earnedCount}/{achievements.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          role="list"
          aria-label="Achievement badges"
        >
          {achievements.map((badge) => (
            <BadgeCard key={badge.id} badge={badge} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
