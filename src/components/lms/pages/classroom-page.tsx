"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  X,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import type { SlideContent, ClassroomState } from "@/types/lms";

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

export function ClassroomPage() {
  const { classroomState, goBack } = useNavigationStore();
  const userId = useUserStore((s) => s.currentUserId);
  const [localState, setLocalState] = useState<ClassroomState | null>(null);
  const [zoom, setZoom] = useState(100);
  const [loadingSlides, setLoadingSlides] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"forward" | "back">("forward");
  const [isAnimating, setIsAnimating] = useState(false);
  const hasFetchedRef = useRef(false);

  // Keep a working copy of classroomState so we can mutate currentSlide
  useEffect(() => {
    if (classroomState) {
      setLocalState({ ...classroomState });
      setZoom(100);
      hasFetchedRef.current = false;
    }
  }, [classroomState]);

  // If slides were empty initially, try fetching them
  useEffect(() => {
    if (!localState || localState.slides.length > 0 || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    const fetchSlides = async () => {
      setLoadingSlides(true);
      try {
        const res = await fetch(`/api/sections/${localState.sectionId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success && json.data.content) {
          const slides: SlideContent[] = Array.isArray(json.data.content)
            ? json.data.content
            : [];
          setLocalState((prev) =>
            prev
              ? {
                  ...prev,
                  slides,
                  totalPages: slides.length || prev.totalPages,
                }
              : prev
          );
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingSlides(false);
      }
    };
    fetchSlides();
  }, [localState?.sectionId, localState?.slides.length]);

  /** Navigate slides with transition animation */
  const goToSlide = useCallback(
    (index: number) => {
      if (!localState || isAnimating) return;
      const next = Math.max(0, Math.min(index, localState.totalPages - 1));
      if (next === localState.currentSlide) return;
      setSlideDirection(next > localState.currentSlide ? "forward" : "back");
      setIsAnimating(true);
      // Small delay for exit animation, then update slide
      setTimeout(() => {
        setLocalState((prev) =>
          prev ? { ...prev, currentSlide: next } : prev
        );
        setIsAnimating(false);
      }, 150);
    },
    [localState, isAnimating]
  );

  /** Persist progress to API when slide changes */
  useEffect(() => {
    if (!localState || !userId) return;
    const saveProgress = async () => {
      try {
        // Get enrollment ID from the API
        const enrollRes = await fetch(`/api/enrollments?userId=${userId}`);
        const enrollJson = await enrollRes.json();
        if (enrollJson.success && Array.isArray(enrollJson.data)) {
          const enrollment = enrollJson.data.find(
            (e: Record<string, unknown>) => e.courseId === localState.courseId
          );
          if (enrollment) {
            const completed = localState.currentSlide >= localState.totalPages - 1;
            await fetch("/api/progress", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                enrollmentId: enrollment.id,
                sectionId: localState.sectionId,
                currentPage: localState.currentSlide + 1,
                completed,
              }),
            });
          }
        }
      } catch {
        // Progress saving is best-effort
      }
    };
    // Debounce to avoid excessive API calls
    const timer = setTimeout(saveProgress, 500);
    return () => clearTimeout(timer);
  }, [localState?.currentSlide]);

  const goPrev = () => goToSlide((localState?.currentSlide ?? 0) - 1);
  const goNext = () => goToSlide((localState?.currentSlide ?? 0) + 1);

  // ─── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          goBack();
          break;
        case "ArrowLeft":
          e.preventDefault();
          goPrev();
          break;
        case "ArrowRight":
          e.preventDefault();
          goNext();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [goBack, goPrev, goNext]);

  /** Zoom controls */
  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  const zoomFit = () => setZoom(100);

  // ─── No state guard ─────────────────────────────
  if (!localState) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentSlide =
    localState.slides[localState.currentSlide] ?? null;
  const isFirst = localState.currentSlide === 0;
  const isLast = localState.currentSlide >= localState.totalPages - 1;
  const progressPercent = localState.totalPages > 1
    ? Math.round(((localState.currentSlide + 1) / localState.totalPages) * 100)
    : 100;

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      {/* ─── Top Progress Bar ─────────────────────── */}
      <div className="shrink-0 h-1 w-full bg-muted overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ─── Top Bar ──────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 sm:px-6">
        {/* Logo, Section Title, Course Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="hidden sm:inline text-sm font-bold text-primary">
              OpenClass
            </span>
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground truncate leading-tight">
              {localState.sectionTitle}
            </h2>
            <p className="text-xs text-muted-foreground truncate leading-tight">
              {localState.courseTitle}
            </p>
          </div>
        </div>

        {/* Slide Pagination - Pill Badge */}
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary tabular-nums">
          {localState.currentSlide + 1}
          <span className="text-primary/40 font-normal">/</span>
          {localState.totalPages}
        </span>
      </header>

      {/* ─── Slide Content Area ────────────────────── */}
      <div className="flex-1 overflow-auto flex items-start justify-center py-8 px-4 sm:px-6">
        <div
          className={`
            bg-card rounded-2xl shadow-lg border w-full max-w-3xl
            ring-1 ring-black/5
            dark:ring-white/5
            paper-texture
            ${isAnimating
              ? (slideDirection === "forward" ? "slide-exit" : "opacity-0 -translate-x-2 transition-all duration-150")
              : "slide-enter"
            }
          `}
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: "top center",
          }}
        >
          {loadingSlides ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : currentSlide ? (
            <div className="p-8 sm:p-12 max-w-2xl mx-auto">
              <SlideRenderer slide={currentSlide} />
            </div>
          ) : (
            <div className="flex items-center justify-center py-32 text-muted-foreground">
              <p>No slide content available.</p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom Controls (Frosted Glass) ───────── */}
      <footer className="shrink-0 border-t frosted-glass">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={zoomOut}
                  disabled={zoom <= MIN_ZOOM}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom Out</TooltipContent>
            </Tooltip>

            <span className="w-12 text-center text-xs font-medium text-muted-foreground tabular-nums">
              {zoom}%
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={zoomIn}
                  disabled={zoom >= MAX_ZOOM}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom In</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={zoomFit}
                >
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit Width</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={zoomFit}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset Zoom</TooltipContent>
            </Tooltip>
          </div>

          {/* Navigation Buttons with labels on desktop */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 transition-opacity ${isFirst ? "opacity-40 cursor-not-allowed" : ""}`}
              onClick={goPrev}
              disabled={isFirst}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 transition-opacity ${isLast ? "opacity-40 cursor-not-allowed" : ""}`}
              onClick={goNext}
              disabled={isLast}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Close + Keyboard Hint */}
          <div className="flex items-center gap-3">
            <span className="hidden lg:inline text-xs text-muted-foreground">
              ← → navigate, ESC exit
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={goBack}
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Close</span>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ============================================
// Slide Content Renderer
// ============================================

function SlideRenderer({ slide }: { slide: SlideContent }) {
  switch (slide.type) {
    case "title":
      return <TitleSlide slide={slide} />;
    case "content":
      return <ContentSlide slide={slide} />;
    case "table":
      return <TableSlide slide={slide} />;
    case "list":
      return <ListSlide slide={slide} />;
    case "code":
      return <CodeSlide slide={slide} />;
    case "quiz":
      return <QuizSlide slide={slide} />;
    default:
      return <FallbackSlide slide={slide} />;
  }
}

// ─── Title Slide ──────────────────────────────────
function TitleSlide({ slide }: { slide: SlideContent }) {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center text-center">
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4 leading-tight">
        {slide.title}
      </h1>
      {slide.subtitle && (
        <p className="text-lg text-gray-500 max-w-xl leading-relaxed">
          {slide.subtitle}
        </p>
      )}
    </div>
  );
}

// ─── Content Slide ────────────────────────────────
function ContentSlide({ slide }: { slide: SlideContent }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
      {slide.items && slide.items.length > 0 && (
        <div className="space-y-5">
          {slide.items.map((item, i) => (
            <div key={i}>
              {item.heading && (
                <h3 className="text-base font-semibold text-gray-800 mb-1.5">
                  {item.heading}
                </h3>
              )}
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Table Slide ──────────────────────────────────
function TableSlide({ slide }: { slide: SlideContent }) {
  if (!slide.tableData) return <FallbackSlide slide={slide} />;
  const { headers, rows } = slide.tableData;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-left font-semibold text-gray-700 whitespace-nowrap"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr
                key={ri}
                className={ri < rows.length - 1 ? "border-b border-gray-100" : ""}
              >
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── List Slide ───────────────────────────────────
function ListSlide({ slide }: { slide: SlideContent }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
      {slide.items && slide.items.length > 0 && (
        <ul className="space-y-3">
          {slide.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
              <div>
                {item.heading && (
                  <span className="font-semibold text-gray-800 text-sm">
                    {item.heading}{" "}
                  </span>
                )}
                <span className="text-sm text-gray-600 leading-relaxed">
                  {item.text}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Code Slide ───────────────────────────────────
function CodeSlide({ slide }: { slide: SlideContent }) {
  if (!slide.codeBlock) return <FallbackSlide slide={slide} />;

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
      <div className="rounded-lg border border-gray-200 bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-2">
          <span className="text-xs font-medium text-gray-400">
            {slide.codeBlock.language}
          </span>
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/60" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
            <span className="h-3 w-3 rounded-full bg-green-500/60" />
          </div>
        </div>
        <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
          <code className="text-gray-100 font-mono">
            {slide.codeBlock.code}
          </code>
        </pre>
      </div>
    </div>
  );
}

// ─── Quiz Slide ───────────────────────────────────
function QuizSlide({ slide }: { slide: SlideContent }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
      {slide.items && slide.items.length > 0 && (
        <div className="space-y-4">
          {slide.items.map((item, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 p-4 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                  {String.fromCharCode(65 + i)}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">
                    {item.heading || item.text}
                  </p>
                  {item.heading && item.text !== item.heading && (
                    <p className="text-xs text-gray-500 mt-1">{item.text}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Fallback Slide ───────────────────────────────
function FallbackSlide({ slide }: { slide: SlideContent }) {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{slide.title}</h2>
      {slide.subtitle && (
        <p className="text-gray-500 mb-4">{slide.subtitle}</p>
      )}
      {slide.items?.map((item, i) => (
        <p key={i} className="text-sm text-gray-600 mb-2">
          {item.heading && <span className="font-semibold">{item.heading}: </span>}
          {item.text}
        </p>
      ))}
    </div>
  );
}
