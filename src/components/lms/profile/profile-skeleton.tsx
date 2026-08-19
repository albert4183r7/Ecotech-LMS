"use client";

import { SkeletonList } from "@/components/lms/skeleton-cards";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Banner skeleton */}
      <Skeleton className="skeleton-shimmer h-40 w-full rounded-2xl" />
      {/* Cards skeleton */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card
          className="border-border/50 bg-card/50 skeleton-shimmer opacity-0 backdrop-blur-sm"
          style={{ animation: `viewFadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 80ms forwards` }}
        >
          <CardHeader className="pb-4">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <Skeleton className="h-36 w-36 rounded-full" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="h-9 w-9 rounded-lg" />
                  <Skeleton className="h-6 w-8" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card
          className="border-border/50 bg-card/50 skeleton-shimmer opacity-0 backdrop-blur-sm"
          style={{ animation: `viewFadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 160ms forwards` }}
        >
          <CardHeader className="pb-4">
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Learning path timeline skeleton */}
      <Card
        className="border-border/50 bg-card/50 skeleton-shimmer opacity-0 backdrop-blur-sm"
        style={{ animation: `viewFadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) 240ms forwards` }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-5 w-28" />
          </div>
        </CardHeader>
        <CardContent>
          <SkeletonList count={3} />
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Profile Page                                                  */
/* ------------------------------------------------------------------ */
