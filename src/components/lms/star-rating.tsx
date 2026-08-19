"use client";

import { useState, useCallback } from "react";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StarRatingProps {
  courseId: string;
  userId: string;
  currentRating: number | null;
  averageRating: number;
  ratingCount: number;
  onRate?: (data: { score: number; average: number; count: number }) => void;
}

export function StarRating({
  courseId,
  userId,
  currentRating,
  averageRating,
  ratingCount,
  onRate,
}: StarRatingProps) {
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  const displayRating = hoveredStar ?? currentRating ?? 0;

  const handleSubmitRating = useCallback(
    async (score: number) => {
      if (submitting || !userId) return;
      setSubmitting(true);

      try {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, courseId, score }),
        });

        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error || "Failed to submit rating");
        }

        const json = await res.json();
        if (json.success) {
          setPulseKey((k) => k + 1);
          toast.success(`You rated this course ${score} star${score > 1 ? "s" : ""}!`);
          onRate?.({ score, average: json.data.average, count: json.data.count });
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to submit rating");
      } finally {
        setSubmitting(false);
      }
    },
    [submitting, userId, courseId, onRate],
  );

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-xs font-medium whitespace-nowrap">
        Your rating
      </span>
      <div
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHoveredStar(null)}
        role="radiogroup"
        aria-label="Rate this course"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const isFilled = star <= Math.round(displayRating);
          const isHalfFilled =
            !isFilled && star === Math.ceil(displayRating) && displayRating % 1 >= 0.3;

          return (
            <button
              key={star}
              type="button"
              disabled={submitting}
              className={
                "relative rounded-sm p-0.5 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-wait disabled:opacity-50"
              }
              onClick={() => handleSubmitRating(star)}
              onMouseEnter={() => setHoveredStar(star)}
              role="radio"
              aria-checked={star === currentRating}
              aria-label={`${star} star${star > 1 ? "s" : ""}`}
            >
              {/* Pulse wrapper */}
              <span
                key={pulseKey}
                className={
                  pulseKey > 0 ? "inline-block animate-[ratingPulse_0.4s_ease-out]" : "inline-block"
                }
              >
                {/* Background (empty) star */}
                <Star className="text-muted-foreground/25 h-5 w-5" />

                {/* Filled overlay */}
                {(isFilled || isHalfFilled) && (
                  <span
                    className="absolute inset-0.5 overflow-hidden"
                    style={{ width: isHalfFilled ? "50%" : "100%" }}
                  >
                    <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Rating number */}
      <span className="text-foreground min-w-[2.5rem] text-sm font-semibold tabular-nums">
        {submitting ? (
          <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />
        ) : currentRating ? (
          <span className="text-amber-500">{currentRating}.0</span>
        ) : (
          <span className="text-muted-foreground/50 text-xs">—</span>
        )}
      </span>

      {/* Total count */}
      <span className="text-muted-foreground text-xs">
        ({ratingCount} {ratingCount === 1 ? "rating" : "ratings"})
      </span>
    </div>
  );
}
