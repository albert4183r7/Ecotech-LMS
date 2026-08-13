"use client";
import { Skeleton } from "@/components/ui/skeleton";

interface SkeletonCardProps {
  lines?: number;
  showImage?: boolean;
  className?: string;
}

export function SkeletonCard({ lines = 2, showImage = true, className }: SkeletonCardProps) {
  return (
    <div className={"overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm skeleton-shimmer" + (className ? ` ${className}` : "")}>
      {showImage && <Skeleton className="aspect-video w-full rounded-none" />}
      <div className="space-y-2.5 p-3.5">
        <Skeleton className="h-4 w-3/4" />
        {Array.from({ length: lines - 1 }).map((_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 opacity-0"
          style={{
            animation: `viewFadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms forwards`,
          }}
        >
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
