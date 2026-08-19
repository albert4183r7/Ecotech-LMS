"use client";

import { useMemo } from "react";

export const CONFETTI_COLORS = [
  "#3882f6", // blue
  "#14b8a6", // teal
  "#22d3ee", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#6366f1", // indigo accent
  "#8b5cf6", // violet accent
  "#ec4899", // pink accent
];
export type ParticleShape = "circle" | "rectangle" | "triangle";
export interface ConfettiParticle {
  id: number;
  left: number;
  color: string;
  shape: ParticleShape;
  size: number;
  fallDuration: string;
  fallDelay: string;
  drift: string;
  spin: string;
}
export function ConfettiCelebration() {
  const particles = useMemo<ConfettiParticle[]>(() => {
    const result: ConfettiParticle[] = [];
    const shapes: ParticleShape[] = ["circle", "rectangle", "triangle"];
    const count = 80;

    for (let i = 0; i < count; i++) {
      const shape = shapes[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2];
      result.push({
        id: i,
        left: Math.random() * 100,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        shape,
        size: Math.floor(Math.random() * 8) + 6, // 6-14px
        fallDuration: `${(Math.random() * 1.5 + 2).toFixed(2)}s`, // 2-3.5s
        fallDelay: `${(Math.random() * 0.8).toFixed(2)}s`, // 0-0.8s
        drift: `${(Math.random() * 120 - 60).toFixed(0)}px`, // -60 to +60px
        spin: `${Math.floor(Math.random() * 720 + 360)}deg`, // 360-1080deg
      });
    }
    return result;
  }, []);

  return (
    <>
      {/* Confetti particles layer */}
      <div className="confetti-container" aria-hidden="true">
        {particles.map((p) => {
          if (p.shape === "triangle") {
            return (
              <div
                key={p.id}
                className="confetti-particle confetti-triangle"
                style={
                  {
                    left: `${p.left}%`,
                    "--confetti-color": p.color,
                    "--tri-size": `${p.size}px`,
                    "--fall-duration": p.fallDuration,
                    "--fall-delay": p.fallDelay,
                    "--drift": p.drift,
                    "--spin": p.spin,
                  } as React.CSSProperties
                }
              />
            );
          }
          return (
            <div
              key={p.id}
              className={`confetti-particle ${
                p.shape === "circle" ? "confetti-circle" : "confetti-rectangle"
              }`}
              style={
                {
                  left: `${p.left}%`,
                  width: p.shape === "rectangle" ? `${p.size * 1.4}px` : `${p.size}px`,
                  height: `${p.size}px`,
                  backgroundColor: p.color,
                  "--fall-duration": p.fallDuration,
                  "--fall-delay": p.fallDelay,
                  "--drift": p.drift,
                  "--spin": p.spin,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>

      {/* Congratulations message */}
      <div className="confetti-message" role="status" aria-label="Congratulations!">
        <div className="confetti-message-text flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 shadow-lg dark:bg-zinc-800/90">
            <span className="text-4xl">🎉</span>
          </div>
          <div className="rounded-2xl bg-white/90 px-8 py-5 text-center shadow-xl dark:bg-zinc-800/90">
            <h2 className="text-foreground text-2xl font-bold sm:text-3xl">🎉 Congratulations!</h2>
            <p className="text-muted-foreground mt-2 text-sm">You&apos;ve completed this lesson!</p>
          </div>
        </div>
      </div>
    </>
  );
}
