"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Check,
  Eye,
  LayoutList,
  Loader2,
  Pencil,
  Play,
  Trash2,
  X,
} from "lucide-react";

export interface OutlineSlideDraft {
  id: string;
  slideId: string | null;
  title: string;
  outline: string;
  order: number;
}

/** Per-slide generation state */
export interface SlideGenState {
  status: "pending" | "generating" | "complete" | "error";
  htmlBody?: string;
  error?: string;
}

/**
 * Which stage of "generate a lesson" is running.
 *
 * "quiz" covers everything that happens after the last slide reports READY:
 * the review pass over the deck, and the quiz written from it. Both run for as
 * long as the slides did, which is why the stage is named rather than folded
 * into a single "generating".
 */
export type GenStage = "idle" | "slides" | "quiz";

/** A planned section of the presentation. One section owns several slides. */
export interface OutlineSectionDraft {
  id: string;
  title: string;
  summary: string;
  subtopics: string[];
  /** What this section asserts — the reason it is in the lesson. */
  claim?: string;
  /** The example, comparison or walkthrough it teaches through. */
  vehicle?: string;
  slideBudget: number;
  order: number;
}

/** A lesson created via the outline flow (persisted in DB) */
export interface OutlineLessonDraft {
  id: string;
  title: string;
  subtitle?: string;
  slides: OutlineSlideDraft[];
  sections?: OutlineSectionDraft[];
  /** What the user asked for, to show the budget adds up. */
  requestedSlideCount?: number;
  /** Notes about merges or compression the plan had to make. */
  adjustments?: string[];
  /**
   * The brief the plan wrote for itself.
   *
   * The planner always had an audience and an argument in mind; they were
   * never written down, so nobody could see that it had settled on "general
   * business professionals" until the slides came out reading that way.
   */
  audience?: string;
  thesis?: string;
  misconception?: string;
  /** The vocabulary the lesson undertakes to teach. */
  keyTerms?: string[];
  language: string;
  style: string;
  topic: string;
  // Generation state
  allReady?: boolean;
}

// ============================================
// Constants
// ============================================
export interface OutlineLessonCardProps {
  lesson: OutlineLessonDraft;
  index: number;
  expanded: boolean;
  isGenerating: boolean;
  slideGenStates: Record<string, SlideGenState>;
  currentGenSlideId: string | null;
  genProgress: { current: number; total: number };
  /** Which stage of the workflow is running, so the label matches the work. */
  genStage?: GenStage;
  /** True while the generated slide HTML is on its way from the server. */
  previewLoading?: boolean;
  onToggleExpand: () => void;
  onEditOutline: () => void;
  onUpdateSlideTitle: (slideId: string, newTitle: string) => void;
  onDeleteSlide: (slideId: string, localId: string) => void;
  onGenerateSlides: () => void;
  onCancelGeneration: () => void;
  onDelete: () => void;
  /** Open the full review screen for this lesson. */
  onPreview?: () => void;
}
export function OutlineLessonCard({
  lesson,
  index,
  expanded,
  isGenerating,
  slideGenStates,
  currentGenSlideId,
  genProgress,
  genStage,
  previewLoading,
  onToggleExpand,
  onEditOutline,
  onUpdateSlideTitle,
  onDeleteSlide,
  onGenerateSlides,
  onCancelGeneration,
  onDelete,
  onPreview,
}: OutlineLessonCardProps) {
  const hasReadySlides = lesson.slides.some(
    (s) => s.slideId && slideGenStates[s.slideId]?.status === "complete",
  );
  const allComplete =
    lesson.allReady ||
    lesson.slides.every((s) => !s.slideId || slideGenStates[s.slideId]?.status === "complete");
  const completedCount = lesson.slides.filter(
    (s) => s.slideId && slideGenStates[s.slideId]?.status === "complete",
  ).length;

  const firstCompletedHtml = (() => {
    const found = lesson.slides.find((s) => s.slideId && slideGenStates[s.slideId]?.htmlBody);
    return found?.slideId ? slideGenStates[found.slideId]?.htmlBody || "" : "";
  })();

  // Everything after the last slide: the review pass and the quiz. The deck
  // itself is finished, so it is shown rather than withheld until the whole
  // workflow ends — which is minutes later on a long lesson.
  const finishing = isGenerating && genStage === "quiz";
  const showDeck = hasReadySlides && (!isGenerating || finishing);

  return (
    <div
      className={`group rounded-lg border transition-colors ${
        isGenerating
          ? "border-primary/50 bg-primary/[0.03]"
          : allComplete
            ? "border-emerald-300/60 bg-emerald-50/30 dark:bg-emerald-950/10"
            : hasReadySlides
              ? "border-border/60 bg-card hover:bg-accent/30"
              : "border-primary/30 bg-primary/[0.02] hover:bg-primary/[0.04]"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Number Badge */}
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            allComplete
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
              : isGenerating
                ? "bg-primary/10 text-primary animate-pulse"
                : "bg-primary/10 text-primary"
          }`}
        >
          {allComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-foreground truncate text-sm font-medium">{lesson.title}</p>
          <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
            {/* Work in progress is reported before "Ready": every slide is
                complete during the review and quiz stages, so checking
                allComplete first announced a lesson that was not finished. */}
            {isGenerating ? (
              <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {finishing
                  ? `${genProgress.total} slides ready · writing the quiz`
                  : `Generating ${genProgress.current}/${genProgress.total}`}
              </span>
            ) : allComplete ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Check className="h-2.5 w-2.5" />
                Ready
              </span>
            ) : hasReadySlides ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {completedCount}/{lesson.slides.length} slides
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <LayoutList className="h-2.5 w-2.5" />
                {lesson.slides.length} slides
              </span>
            )}
          </div>
        </div>

        {/* Edit outline button (only when not generating and not all complete) */}
        {!isGenerating && !allComplete && (
          <button
            onClick={onEditOutline}
            className="text-muted-foreground/50 hover:bg-primary/10 hover:text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-all group-hover:opacity-100"
            title="Edit outline"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
            expanded
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted opacity-0 group-hover:opacity-100"
          }`}
          title={expanded ? "Hide slides" : "Show slides"}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>

        {/* Delete button (only when not generating) */}
        {!isGenerating && (
          <button
            onClick={onDelete}
            className="text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-all group-hover:opacity-100"
            aria-label="Delete lesson"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ---- Expanded content ---- */}
      {expanded && (
        <div className="border-border/40 space-y-3 border-t px-3 pt-2 pb-3">
          {/* Generation progress.
              The bar tracked slides only, so once they were all written it sat
              at 100% and said "Generating slide 12 of 12" for as long as the
              review and the quiz took — which read as a hang. Each stage now
              says what it is doing, and what the instructor can already do. */}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  {finishing
                    ? `All ${genProgress.total} slides are written. Reviewing them and writing the quiz…`
                    : `Generating slide ${genProgress.current} of ${genProgress.total}...`}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelGeneration}
                  className="text-destructive hover:text-destructive h-6 shrink-0 gap-1 text-xs"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </Button>
              </div>
              <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                <div
                  className={`bg-primary h-full rounded-full transition-all duration-500 ${
                    finishing ? "animate-pulse" : ""
                  }`}
                  style={{
                    width: `${genProgress.total > 0 ? (genProgress.current / genProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              {finishing && (
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  This last step usually takes a minute or two. The slides below are already
                  finished — you can preview and edit them now, and the quiz appears here when it is
                  written.
                </p>
              )}
            </div>
          )}

          {/* ---- Who it is for, and what it argues ----
              The three lines worth reading before spending a generation on
              this lesson: a wrong audience or a flat argument is visible here
              in seconds, and costs a whole deck to discover afterwards. */}
          {(lesson.audience || lesson.thesis || lesson.keyTerms?.length) && (
            <div className="border-primary/20 bg-primary/[0.03] space-y-1.5 rounded-md border p-2.5">
              {lesson.audience && (
                <div className="flex gap-2 text-[11px]">
                  <span className="text-muted-foreground w-20 shrink-0 font-semibold tracking-wide uppercase">
                    For
                  </span>
                  <span className="text-foreground flex-1">{lesson.audience}</span>
                </div>
              )}
              {lesson.misconception && (
                <div className="flex gap-2 text-[11px]">
                  <span className="text-muted-foreground w-20 shrink-0 font-semibold tracking-wide uppercase">
                    Correcting
                  </span>
                  <span className="text-foreground flex-1">{lesson.misconception}</span>
                </div>
              )}
              {lesson.thesis && (
                <div className="flex gap-2 text-[11px]">
                  <span className="text-muted-foreground w-20 shrink-0 font-semibold tracking-wide uppercase">
                    Remember
                  </span>
                  <span className="text-foreground flex-1">{lesson.thesis}</span>
                </div>
              )}
              {/* Coverage, at a glance. Whether the lesson on agents actually
                  reaches RAG and function calling is the question an
                  instructor wants answered before generating twelve slides. */}
              {lesson.keyTerms && lesson.keyTerms.length > 0 && (
                <div className="flex gap-2 text-[11px]">
                  <span className="text-muted-foreground w-20 shrink-0 font-semibold tracking-wide uppercase">
                    Teaches
                  </span>
                  <span className="flex flex-1 flex-wrap gap-1">
                    {lesson.keyTerms.map((term) => (
                      <span
                        key={term}
                        className="bg-primary/10 text-primary rounded px-1.5 py-0.5 text-[10px] font-medium"
                      >
                        {term}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ---- The plan the user is approving ---- */}
          {lesson.sections && lesson.sections.length > 0 && (
            <div className="border-border/40 bg-muted/30 space-y-2 rounded-md border p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                  Presentation plan
                </span>
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {lesson.sections.length} sections &middot; {lesson.slides.length} slides
                </Badge>
              </div>

              {lesson.sections.map((section) => (
                <div key={section.id} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-foreground text-xs font-medium">{section.title}</span>
                    <span className="text-muted-foreground shrink-0 text-[11px]">
                      {section.slideBudget} {section.slideBudget === 1 ? "slide" : "slides"}
                    </span>
                  </div>
                  {section.claim && (
                    <p className="text-foreground/80 ml-3 text-[11px] italic">{section.claim}</p>
                  )}
                  {section.vehicle && (
                    <p className="text-muted-foreground ml-3 text-[11px]">via {section.vehicle}</p>
                  )}
                  {section.subtopics.length > 0 && (
                    <ul className="text-muted-foreground ml-3 list-disc space-y-0.5 text-[11px]">
                      {section.subtopics.map((topic, i) => (
                        <li key={i}>{topic}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}

              <div className="border-border/40 flex justify-between border-t pt-1.5 text-[11px] font-medium">
                <span>Total</span>
                <span>
                  {lesson.slides.length}
                  {lesson.requestedSlideCount && lesson.requestedSlideCount !== lesson.slides.length
                    ? ` of ${lesson.requestedSlideCount} requested`
                    : " slides"}
                </span>
              </div>

              {lesson.adjustments && lesson.adjustments.length > 0 && (
                <div className="text-muted-foreground space-y-0.5 text-[11px] italic">
                  {lesson.adjustments.map((note, i) => (
                    <p key={i}>{note}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Completed slides preview */}
          <div className="space-y-1.5">
            {lesson.slides.map((slide, i) => {
              const genState = slide.slideId ? slideGenStates[slide.slideId] : null;
              const isCurrentGen = slide.slideId === currentGenSlideId;

              return (
                <div
                  key={slide.id}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors ${
                    isCurrentGen
                      ? "bg-primary/10 border-primary/30 border"
                      : genState?.status === "complete"
                        ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                        : genState?.status === "error"
                          ? "bg-destructive/5"
                          : "bg-muted/30"
                  }`}
                >
                  <span className="text-muted-foreground flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold">
                    {i + 1}
                  </span>
                  <span className="text-foreground flex-1 truncate text-xs">{slide.title}</span>

                  {/* Status icon */}
                  {genState?.status === "generating" && (
                    <Loader2 className="text-primary h-3 w-3 animate-spin" />
                  )}
                  {genState?.status === "complete" && (
                    <Check className="h-3 w-3 text-emerald-500" />
                  )}
                  {genState?.status === "error" && (
                    <span title={genState.error} className="inline-flex">
                      <AlertCircle className="text-destructive h-3 w-3" />
                    </span>
                  )}
                  {!genState && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Draft
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Generate Slides button (only when not generating and not all complete) */}
          {!isGenerating && !allComplete && (
            <Button size="sm" onClick={onGenerateSlides} className="h-8 w-full gap-1.5 text-xs">
              <Play className="h-3 w-3" />
              Generate Slides
            </Button>
          )}

          {/* Generated: a thumbnail here, and the full review a click away.
              The thumbnail alone showed only the first slide, which is not
              enough to decide whether a lesson is fit to publish.

              This used to wait for the whole workflow, so a finished deck sat
              hidden behind the review and quiz stages. It appears as soon as
              the slides do. */}
          {showDeck && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-muted-foreground text-xs font-medium">
                  {completedCount} slide{completedCount !== 1 ? "s" : ""} generated
                </p>
                {onPreview && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-auto h-7 gap-1.5 text-xs"
                    onClick={() => onPreview?.()}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview &amp; edit
                  </Button>
                )}
              </div>
              {firstCompletedHtml ? (
                <div className="border-border/40 overflow-hidden rounded-md border">
                  <iframe
                    srcDoc={firstCompletedHtml}
                    sandbox="allow-same-origin allow-scripts"
                    className="w-full border-0"
                    style={{ aspectRatio: "16/9" }}
                    title={`Preview of ${lesson.title}`}
                  />
                </div>
              ) : (
                /* The slides exist; their markup is still on its way. Saying so
                   is the difference between "loading" and "broken". */
                <div
                  className="border-border/40 bg-muted/30 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-md border text-xs"
                  style={{ aspectRatio: "16/9" }}
                >
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {previewLoading ? "Loading the slides…" : "Preparing the preview…"}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Helpers
// ============================================
