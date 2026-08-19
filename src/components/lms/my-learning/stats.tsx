"use client";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsDashboardCard({
  icon: Icon,
  label,
  value,
  gradient,
  sub,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient: string;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div className="glass-card lms-card-hover rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${gradient}`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="mb-1 h-7 w-12" />
          ) : (
            <p className="text-foreground text-2xl leading-none font-extrabold tracking-tight">
              {value}
            </p>
          )}
          <p className="text-muted-foreground mt-0.5 truncate text-xs font-medium">{label}</p>
          {sub && !loading && <p className="text-[10px] font-medium text-emerald-500">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Circular Mini Progress (for course rows)                           */
/* ------------------------------------------------------------------ */
export function CircularMiniProgress({ percentage }: { percentage: number }) {
  const size = 40;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const circ = r * 2 * Math.PI;
  const offset = circ - (percentage / 100) * circ;

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#mini-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
        <defs>
          <linearGradient id="mini-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-foreground absolute text-[9px] font-bold">{percentage}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Enhanced Empty States with SVG Illustrations                       */
/* ------------------------------------------------------------------ */
