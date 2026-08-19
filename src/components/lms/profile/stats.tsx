"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CircularProgress({ percentage }: { percentage: number }) {
  const radius = 70;
  const stroke = 10;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={radius * 2} height={radius * 2} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/30"
        />
        {/* Progress arc with gradient stroke */}
        <circle
          cx={radius}
          cy={radius}
          r={normalizedRadius}
          fill="none"
          stroke="url(#progress-gradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="50%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-foreground text-3xl font-extrabold tracking-tight">
          {percentage}%
        </span>
        <span className="text-muted-foreground mt-0.5 text-[11px] font-medium">completed</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated Counter Hook                                              */
/* ------------------------------------------------------------------ */
export function useAnimatedCounter(target: number, duration = 800) {
  const [count, setCount] = useState(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === 0) return;
    let start = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = Math.round(eased * target);
      setCount(start);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return count;
}

/* ------------------------------------------------------------------ */
/*  Enhanced Stat Card with glass-morphism                              */
/* ------------------------------------------------------------------ */
export function EnhancedStatCard({
  icon: Icon,
  label,
  value,
  color,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
  trend?: { value: number; direction: "up" | "down" };
}) {
  const animatedValue = useAnimatedCounter(value);
  const TrendIcon = trend?.direction === "up" ? TrendingUp : TrendingDown;

  return (
    <div className="glass-card group flex flex-col items-center gap-2 rounded-xl px-4 py-4 transition-all duration-200 hover:shadow-lg">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${color} shadow-md transition-transform duration-200 group-hover:scale-110`}
      >
        <Icon className="h-4 w-4 text-white" />
      </div>
      <span className="count-up text-foreground text-2xl leading-none font-extrabold">
        {animatedValue}
      </span>
      <span className="text-muted-foreground text-[10px] font-medium">{label}</span>
      {trend && (
        <div
          className={`flex items-center gap-0.5 text-[10px] font-semibold ${trend.direction === "up" ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}
        >
          <TrendIcon className="h-3 w-3" />
          {trend.value}%
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  XP Display Panel                                                   */
/* ------------------------------------------------------------------ */
export function XPDisplay({
  totalXP,
  level,
  progressToNext,
}: {
  totalXP: number;
  level: number;
  progressToNext: number;
}) {
  const animatedXP = useAnimatedCounter(totalXP, 1200);
  const nextLevelXP = level * 500;

  return (
    <Card className="border-border/50 overflow-hidden">
      <div className="relative bg-gradient-to-r from-blue-600/5 via-cyan-600/5 to-teal-500/5 px-6 py-8">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Badge className="bg-gradient-to-r from-cyan-600 to-teal-500 text-xs font-bold text-white shadow-md">
              LVL {level}
            </Badge>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="count-up gradient-text text-5xl font-extrabold tracking-tight">
              {animatedXP}
            </span>
            <span className="gradient-text text-lg font-bold">XP</span>
          </div>
          <p className="text-muted-foreground text-xs">
            {nextLevelXP - (totalXP % 500)} XP to Level {level + 1}
          </p>
        </div>
      </div>
      <CardContent className="pt-4 pb-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Level {level}</span>
            <span className="text-muted-foreground font-medium">Level {level + 1}</span>
          </div>
          <div className="bg-muted/60 h-3 w-full overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${progressToNext}%`,
                background: "linear-gradient(90deg, #06b6d4, #0891b2, #0d9488, #10b981)",
              }}
            />
          </div>
          <p className="text-muted-foreground text-center text-[11px]">{totalXP % 500} / 500 XP</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Streak Calendar (30-day grid)                                      */
/* ------------------------------------------------------------------ */
