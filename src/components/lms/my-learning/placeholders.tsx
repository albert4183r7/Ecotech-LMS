"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";

export function EnhancedEmptyState({
  type,
  onAction,
}: {
  type: "in-progress" | "completed" | "favorites";
  onAction: () => void;
}) {
  const config = {
    "in-progress": {
      svg: (
        <svg viewBox="0 0 120 120" className="h-28 w-28" fill="none">
          <rect
            x="20"
            y="30"
            width="60"
            height="70"
            rx="4"
            className="fill-primary/10 stroke-primary/30"
            strokeWidth="2"
          />
          <rect x="26" y="38" width="48" height="4" rx="2" className="fill-primary/20" />
          <rect x="26" y="48" width="36" height="4" rx="2" className="fill-primary/15" />
          <rect x="26" y="58" width="42" height="4" rx="2" className="fill-primary/15" />
          <rect x="26" y="68" width="30" height="4" rx="2" className="fill-primary/15" />
          <circle
            cx="90"
            cy="85"
            r="20"
            className="fill-teal-500/20 stroke-teal-500/40"
            strokeWidth="2"
          />
          <path
            d="M83 85 L88 90 L98 80"
            className="stroke-teal-500"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="55"
            y="22"
            width="30"
            height="14"
            rx="3"
            className="fill-amber-400/20 stroke-amber-400/40"
            strokeWidth="1.5"
            transform="rotate(-10 70 29)"
          />
        </svg>
      ),
      title: "No courses in progress",
      description: "No courses in progress. Browse our catalog to get started!",
      btnText: "Browse Courses",
      gradient: "from-blue-500 to-cyan-500",
    },
    completed: {
      svg: (
        <svg viewBox="0 0 120 120" className="h-28 w-28" fill="none">
          <path
            d="M60 10 L72 38 H100 L78 55 L86 85 L60 68 L34 85 L42 55 L20 38 H48 Z"
            className="fill-amber-400/20 stroke-amber-400/40"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle
            cx="60"
            cy="58"
            r="14"
            className="fill-emerald-500/20 stroke-emerald-500/40"
            strokeWidth="2"
          />
          <path
            d="M54 58 L58 62 L67 53"
            className="stroke-emerald-500"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
      title: "No completed courses yet",
      description: "No completed courses yet. Keep learning!",
      btnText: "Start Learning",
      gradient: "from-emerald-500 to-teal-500",
    },
    favorites: {
      svg: (
        <svg viewBox="0 0 120 120" className="h-28 w-28" fill="none">
          <path
            d="M60 100 L25 75 C15 68 10 55 20 42 C30 29 48 30 60 45 C72 30 90 29 100 42 C110 55 105 68 95 75 Z"
            className="fill-rose-400/20 stroke-rose-400/40"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M60 88 L33 68 C25 62 22 52 29 43 C36 34 50 35 60 46 C70 35 84 34 91 43 C98 52 95 62 87 68 Z"
            className="fill-rose-500/30 stroke-rose-500/50"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      ),
      title: "No favorite courses",
      description: "No favorite courses. Save courses you're interested in!",
      btnText: "Explore Courses",
      gradient: "from-rose-500 to-pink-500",
    },
  };

  const c = config[type];

  return (
    <div className="glass-card relative flex flex-col items-center justify-center overflow-hidden rounded-2xl py-16 text-center">
      {/* Decorative gradient background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="from-primary/5 absolute top-1/4 left-1/4 h-40 w-40 rounded-full bg-gradient-to-br to-transparent blur-3xl" />
        <div className="absolute right-1/4 bottom-1/4 h-32 w-32 rounded-full bg-gradient-to-tr from-amber-400/5 to-transparent blur-3xl" />
      </div>

      <div className="relative mb-4">{c.svg}</div>
      <h3 className="text-foreground relative text-lg font-bold">{c.title}</h3>
      <p className="text-muted-foreground relative mt-2 max-w-sm text-sm leading-relaxed">
        {c.description}
      </p>
      <Button
        variant="outline"
        className={`relative mt-6 gap-2 bg-gradient-to-r ${c.gradient} border-0 font-semibold text-white shadow-md transition-all hover:opacity-90 hover:shadow-lg`}
        onClick={onAction}
      >
        <Sparkles className="h-4 w-4" />
        {c.btnText}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Enhanced In-Progress Course Card                                    */
/* ------------------------------------------------------------------ */
export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <Skeleton className="h-11 w-11 shrink-0 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="mb-1 h-6 w-8" />
              <Skeleton className="h-3 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
export function ListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} className="border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <Skeleton className="h-16 w-24 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
export function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="border-border/50 overflow-hidden">
          <Skeleton className="aspect-video w-full" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Continue Learning Widget                                           */
/* ------------------------------------------------------------------ */
