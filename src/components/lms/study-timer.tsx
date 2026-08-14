"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Timer, Play, Pause, RotateCcw, Coffee, Brain, ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────

type TimerMode = "focus" | "short-break" | "long-break";

interface TimerState {
  mode: TimerMode;
  focusDuration: number;
  timeRemaining: number;
  isRunning: boolean;
  sessionCount: number;
  completedFocusSessions: number;
  totalCompletedFocusSessions: number;
  totalCompletedMinutes: number;
}

const STORAGE_KEY = "ecotech-study-timer";

const FOCUS_OPTIONS = [15, 25, 30, 45, 60];
const SHORT_BREAK_DURATION = 5 * 60;
const LONG_BREAK_DURATION = 15 * 60;
const SESSIONS_BEFORE_LONG_BREAK = 4;

const MODE_CONFIG: Record<TimerMode, { label: string; color: string; ringColor: string; icon: typeof Brain }> = {
  focus: { label: "Focus", color: "text-teal-500 dark:text-emerald-400", ringColor: "stroke-teal-500 dark:stroke-emerald-400", icon: Brain },
  "short-break": { label: "Short Break", color: "text-cyan-500 dark:text-cyan-400", ringColor: "stroke-cyan-500 dark:stroke-cyan-400", icon: Coffee },
  "long-break": { label: "Long Break", color: "text-blue-500 dark:text-blue-400", ringColor: "stroke-blue-500 dark:stroke-blue-400", icon: Coffee },
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function getModeDuration(mode: TimerMode, focusDuration: number): number {
  switch (mode) {
    case "focus": return focusDuration * 60;
    case "short-break": return SHORT_BREAK_DURATION;
    case "long-break": return LONG_BREAK_DURATION;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatEstimatedTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function loadTimerState(): TimerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TimerState;
    // If timer was running when the page was closed, pause it
    if (parsed.isRunning) {
      const elapsed = Math.floor((Date.now() - (parsed as TimerState & { _lastTick?: number })._lastTick!) / 1000);
      parsed.timeRemaining = Math.max(0, parsed.timeRemaining - elapsed);
      if (parsed.timeRemaining <= 0) {
        parsed.timeRemaining = 0;
        parsed.isRunning = false;
      } else {
        parsed.isRunning = false;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveTimerState(state: TimerState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

// ─── Audio (Web Audio API beep/chime) ─────────────────────────────────────

function playChime() {
  try {
    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.15);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.15 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.6);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.7);
    });
  } catch {
    // Audio not available
  }
}

// ─── Component ────────────────────────────────────────────────────────────

export function StudyTimer() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFocusOptions, setShowFocusOptions] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<TimerState>(() => {
    const saved = loadTimerState();
    if (saved) return saved;
    return {
      mode: "focus",
      focusDuration: 25,
      timeRemaining: 25 * 60,
      isRunning: false,
      sessionCount: 0,
      completedFocusSessions: 0,
      totalCompletedFocusSessions: 0,
      totalCompletedMinutes: 0,
    };
  });

  const totalDuration = getModeDuration(state.mode, state.focusDuration);
  const progress = totalDuration > 0 ? (totalDuration - state.timeRemaining) / totalDuration : 0;
  const config = MODE_CONFIG[state.mode];
  const IconComponent = config.icon;
  const circumference = 2 * Math.PI * 46; // radius 46
  const strokeDashoffset = circumference * (1 - progress);

  // ─── Timer Complete Flash (ref-based to avoid setState in effect) ───
  const flashCompleteRef = useRef(false);
  const [flashComplete, _setFlashComplete] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Timer Tick ───────────────────────────────────────
  useEffect(() => {
    if (state.isRunning) {
      intervalRef.current = setInterval(() => {
        setState((prev) => {
          const next = Math.max(0, prev.timeRemaining - 1);
          if (next <= 0) {
            // Timer just completed
            playChime();
            flashCompleteRef.current = true;
            _setFlashComplete(true);
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            flashTimeoutRef.current = setTimeout(() => {
              flashCompleteRef.current = false;
              _setFlashComplete(false);
            }, 2000);

            const isFocus = prev.mode === "focus";
            return {
              ...prev,
              timeRemaining: 0,
              isRunning: false,
              completedFocusSessions: isFocus ? prev.completedFocusSessions + 1 : prev.completedFocusSessions,
              totalCompletedFocusSessions: isFocus ? prev.totalCompletedFocusSessions + 1 : prev.totalCompletedFocusSessions,
              totalCompletedMinutes: isFocus ? prev.totalCompletedMinutes + prev.focusDuration : prev.totalCompletedMinutes,
              sessionCount: prev.sessionCount + 1,
            };
          }
          return { ...prev, timeRemaining: next };
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [state.isRunning]);

  // ─── Persist State ────────────────────────────────────
  useEffect(() => {
    const toSave = { ...state, _lastTick: Date.now() } as TimerState & { _lastTick: number };
    saveTimerState(toSave);
  }, [state]);

  // ─── Keyboard Shortcuts (only when expanded & focused) ─
  useEffect(() => {
    if (!isExpanded) return;
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setState((prev) => {
          if (prev.timeRemaining <= 0) {
            return {
              ...prev,
              timeRemaining: getModeDuration(prev.mode, prev.focusDuration),
              isRunning: true,
            };
          }
          return { ...prev, isRunning: !prev.isRunning };
        });
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setState((prev) => ({
          ...prev,
          timeRemaining: getModeDuration(prev.mode, prev.focusDuration),
          isRunning: false,
        }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isExpanded]);

  // ─── Actions ──────────────────────────────────────────
  const toggleTimer = useCallback(() => {
    setState((prev) => {
      if (prev.timeRemaining <= 0) {
        // Timer already completed, reset to current mode duration
        return {
          ...prev,
          timeRemaining: getModeDuration(prev.mode, prev.focusDuration),
          isRunning: true,
        };
      }
      return { ...prev, isRunning: !prev.isRunning };
    });
  }, []);

  const resetTimer = useCallback(() => {
    setState((prev) => ({
      ...prev,
      timeRemaining: getModeDuration(prev.mode, prev.focusDuration),
      isRunning: false,
    }));
  }, []);

  const switchMode = useCallback((mode: TimerMode) => {
    setState((prev) => ({
      ...prev,
      mode,
      timeRemaining: getModeDuration(mode, prev.focusDuration),
      isRunning: false,
    }));
  }, []);

  const setFocusDuration = useCallback((minutes: number) => {
    setState((prev) => ({
      ...prev,
      focusDuration: minutes,
      timeRemaining: prev.mode === "focus" ? minutes * 60 : prev.timeRemaining,
      isRunning: false,
    }));
    setShowFocusOptions(false);
  }, []);

  // ─── Auto-suggest break after 4 sessions ─────────────
  const shouldSuggestBreak = state.completedFocusSessions > 0 && state.completedFocusSessions % SESSIONS_BEFORE_LONG_BREAK === 0 && state.mode === "focus" && !state.isRunning;

  const estimatedTotalMinutes = state.totalCompletedMinutes + (state.mode === "focus" ? (state.focusDuration - Math.floor(state.timeRemaining / 60)) : 0);
  const estimatedPlannedMinutes = state.totalCompletedMinutes + (SESSIONS_BEFORE_LONG_BREAK - state.completedFocusSessions % SESSIONS_BEFORE_LONG_BREAK) * state.focusDuration;

  // ─── Compact Button ───────────────────────────────────
  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setIsExpanded(true)}
        className={cn(
          "fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full px-3.5 py-2.5 shadow-lg border transition-all duration-300",
          "bg-card/90 backdrop-blur-md border-border/60",
          "hover:shadow-xl hover:scale-105 press-effect",
          state.isRunning ? "study-timer-pulse" : ""
        )}
        aria-label="Open study timer"
      >
        <Timer className={cn("h-4 w-4", state.isRunning ? "animate-spin" : "", config.color)} style={state.isRunning ? { animationDuration: "3s" } : undefined} />
        <span className={cn("text-xs font-semibold tabular-nums", config.color)}>
          {formatTime(state.timeRemaining)}
        </span>
      </button>
    );
  }

  // ─── Expanded Panel ───────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={cn(
        "fixed bottom-20 right-4 z-40 w-72 rounded-2xl border shadow-2xl overflow-hidden transition-all duration-300",
        "bg-card/95 backdrop-blur-xl border-border/60",
        flashComplete && "study-timer-complete"
      )}
      role="dialog"
      aria-label="Study Timer"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <IconComponent className={cn("h-4 w-4", config.color)} />
          <span className="text-sm font-semibold text-foreground">Study Timer</span>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-muted/80 transition-colors"
          aria-label="Minimize timer"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Mode Tabs */}
      <div className="flex px-3 gap-1">
        {(["focus", "short-break", "long-break"] as TimerMode[]).map((mode) => {
          const mConfig = MODE_CONFIG[mode];
          const isActive = state.mode === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => switchMode(mode)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition-all duration-200",
                isActive
                  ? cn(mConfig.color, "bg-current/10 dark:bg-current/15")
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              style={isActive ? { backgroundColor: "color-mix(in oklch, currentColor 10%, transparent)" } : undefined}
            >
              {mConfig.label}
            </button>
          );
        })}
      </div>

      {/* Focus Duration Selector (only in focus mode) */}
      {state.mode === "focus" && (
        <div className="px-3 mt-2">
          <button
            type="button"
            onClick={() => setShowFocusOptions(!showFocusOptions)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full"
          >
            <span>Focus: {state.focusDuration} min</span>
            {showFocusOptions ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showFocusOptions && (
            <div className="flex gap-1 mt-1.5">
              {FOCUS_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setFocusDuration(opt)}
                  className={cn(
                    "flex-1 rounded-md py-1 text-[11px] font-medium transition-all duration-200",
                    state.focusDuration === opt
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {opt}m
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Circular Timer */}
      <div className="flex justify-center py-4">
        <div className="relative flex items-center justify-center">
          <svg className="timer-ring w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-muted/20"
            />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              className={cn(config.ringColor, "transition-all duration-1000 ease-linear")}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{
            filter: state.isRunning ? `drop-shadow(0 0 6px color-mix(in oklch, currentColor 40%, transparent))` : "none",
          }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-2xl font-bold tabular-nums tracking-tight", config.color)}>
              {formatTime(state.timeRemaining)}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
              {config.label}
            </span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-2 px-4 pb-3">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full press-effect"
          onClick={resetTimer}
          aria-label="Reset timer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          className={cn(
            "h-10 w-10 rounded-full shadow-md press-effect transition-all duration-200",
            state.isRunning && "study-timer-pulse"
          )}
          onClick={toggleTimer}
          aria-label={state.isRunning ? "Pause timer" : "Start timer"}
        >
          {state.isRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </Button>
        <div className="h-8 w-8" /> {/* Spacer for centering */}
      </div>

      {/* Session Info */}
      <div className="border-t border-border/40 px-4 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Session</span>
          <span className={cn("text-[11px] font-semibold tabular-nums", config.color)}>
            {(state.completedFocusSessions % SESSIONS_BEFORE_LONG_BREAK) + (state.mode === "focus" && state.isRunning ? 1 : 0)}/{SESSIONS_BEFORE_LONG_BREAK}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Studied</span>
          <span className="text-[11px] font-semibold tabular-nums text-foreground">
            {state.totalCompletedFocusSessions} sessions · {formatEstimatedTime(state.totalCompletedMinutes)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">Est. total</span>
          <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
            ~{formatEstimatedTime(estimatedPlannedMinutes)}
          </span>
        </div>
      </div>

      {/* Auto-suggest break banner */}
      {shouldSuggestBreak && (
        <div className="border-t border-border/40 px-4 py-2.5">
          <button
            type="button"
            onClick={() => switchMode("long-break")}
            className="w-full rounded-lg bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20 px-3 py-2 text-center transition-all hover:bg-blue-500/20 press-effect"
          >
            <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
              ☕ Time for a long break! (15 min)
            </span>
          </button>
        </div>
      )}

      {/* Keyboard shortcut hint */}
      <div className="px-4 pb-3 pt-1">
        <p className="text-[10px] text-muted-foreground/50 text-center">
          Space: play/pause · R: reset
        </p>
      </div>
    </div>
  );
}
