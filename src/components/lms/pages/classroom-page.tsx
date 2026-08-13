"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  StickyNote,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import type { SlideContent, ClassroomState } from "@/types/lms";
import { StudyTimer } from "@/components/lms/study-timer";

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
  const confettiShownRef = useRef(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ─── Notes Sidebar State ──────────────────────
  interface Note {
    id: string;
    content: string;
    slideNumber: number;
    bookmarked: boolean;
    createdAt?: string;
  }
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesSidebarOpen, setNotesSidebarOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const notesEndRef = useRef<HTMLDivElement>(null);

  // ─── Keyboard Hint Fade ────────────────────────
  const [showKeyboardHint, setShowKeyboardHint] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
        case " ":
          e.preventDefault();
          goNext();
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    // Listen for custom event from KeyboardShortcuts component
    function handleCustomNextSlide() {
      goNext();
    }
    document.addEventListener("lms:next-slide", handleCustomNextSlide);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("lms:next-slide", handleCustomNextSlide);
    };
  }, [goBack, goPrev, goNext]);

  /** Zoom controls */
  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  const zoomFit = () => setZoom(100);

  // ─── Confetti on section completion ───────────
  useEffect(() => {
    if (!localState) return;
    const isOnLastSlide = localState.currentSlide === localState.totalPages - 1;
    if (isOnLastSlide && !confettiShownRef.current) {
      confettiShownRef.current = true;
      setShowConfetti(true);
      toast.success("🎉 You completed the course! Great job!");
      // Auto-cleanup after 3.5s (animation lasts ~3s + buffer)
      const timer = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [localState?.currentSlide]);

  // Reset confetti flag when classroom state changes (new section)
  useEffect(() => {
    confettiShownRef.current = false;
    setShowConfetti(false);
  }, [classroomState?.sectionId]);

  // ─── Keyboard Hint Auto-Fade ────────────────────
  useEffect(() => {
    setShowKeyboardHint(true);
    const timer = setTimeout(() => setShowKeyboardHint(false), 5000);
    return () => clearTimeout(timer);
  }, [localState?.sectionId]);

  // ─── Notes CRUD ─────────────────────────────────
  const fetchNotes = useCallback(async () => {
    if (!localState || !userId) return;
    try {
      const res = await fetch(
        `/api/notes?userId=${userId}&courseId=${localState.courseId}&sectionId=${localState.sectionId}`
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setNotes(json.data);
      }
    } catch {
      // Silently fail
    }
  }, [localState, userId]);

  // Fetch notes when section changes or sidebar opens
  useEffect(() => {
    if (notesSidebarOpen) fetchNotes();
  }, [notesSidebarOpen, fetchNotes, localState?.sectionId]);

  const createNote = useCallback(async () => {
    if (!localState || !userId || !newNoteContent.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          courseId: localState.courseId,
          sectionId: localState.sectionId,
          content: newNoteContent.trim(),
          slideNumber: localState.currentSlide + 1,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setNotes((prev) => [...prev, json.data]);
        setNewNoteContent("");
        setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }, [localState, userId, newNoteContent]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/notes?id=${noteId}`, { method: "DELETE" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      }
    } catch {
      // Silently fail
    }
  }, []);

  const toggleBookmark = useCallback((noteId: string) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId ? { ...n, bookmarked: !n.bookmarked } : n
      )
    );
  }, []);

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
    <div className="flex h-screen flex-col bg-muted/30 relative">
      {/* ─── Mobile Notes Sheet ──────────────────── */}
      <Sheet open={notesSidebarOpen && isMobile} onOpenChange={(open) => { if (!open) setNotesSidebarOpen(false); }}>
        <SheetContent side="right" className="w-full sm:max-w-sm p-0">
          <SheetHeader className="px-4 pt-4 pb-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4" />
              Notes
            </SheetTitle>
            <SheetDescription>
              Notes for slide {localState.currentSlide + 1} of {localState.totalPages}
            </SheetDescription>
          </SheetHeader>
          <NotesSidebarContent
            notes={notes}
            currentSlide={localState.currentSlide}
            newNoteContent={newNoteContent}
            savingNote={savingNote}
            onContentChange={setNewNoteContent}
            onCreate={createNote}
            onDelete={deleteNote}
            onToggleBookmark={toggleBookmark}
            endRef={notesEndRef}
          />
        </SheetContent>
      </Sheet>
      {/* ─── Confetti Celebration Overlay ─────── */}
      {showConfetti && <ConfettiCelebration />}
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

        {/* Slide Counter - Enhanced */}
        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary tabular-nums">
          <span className="font-semibold">Slide {localState.currentSlide + 1}</span>
          <span className="text-primary/40 font-normal">of</span>
          <span className="font-semibold">{localState.totalPages}</span>
        </span>
      </header>

      {/* ─── Main Layout: Slide + Desktop Notes Sidebar ── */}
      <div className="flex flex-1 overflow-hidden">
      {/* ─── Slide Content Area ────────────────────── */}
      <div className="flex-1 overflow-auto flex flex-col items-center py-8 px-4 sm:px-6">
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

        {/* ─── Slide Progress Dots ────────────────── */}
        <div className="slide-progress-indicator mt-6 shrink-0">
          {Array.from({ length: localState.totalPages }, (_, i) => {
            const isCompleted = i < localState.currentSlide;
            const isActive = i === localState.currentSlide;
            return (
              <button
                key={i}
                className={`dot ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
                onClick={() => goToSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
              />
            );
          })}
        </div>
      </div>

      {/* ─── Desktop Notes Sidebar (slide-in panel) ── */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-l bg-card transition-all duration-300 ease-in-out overflow-hidden ${
          notesSidebarOpen ? "w-80 opacity-100" : "w-0 opacity-0 border-l-0"
        }`}
      >
        <div className="flex flex-col h-full w-80">
          {/* Sidebar Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Notes</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setNotesSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <NotesSidebarContent
            notes={notes}
            currentSlide={localState.currentSlide}
            newNoteContent={newNoteContent}
            savingNote={savingNote}
            onContentChange={setNewNoteContent}
            onCreate={createNote}
            onDelete={deleteNote}
            onToggleBookmark={toggleBookmark}
            endRef={notesEndRef}
          />
        </div>
      </aside>
      </div>

      {/* ─── Keyboard Shortcuts Hint (auto-fades) ── */}
      <div
        className={`shrink-0 frosted-glass border-t px-4 py-1.5 text-center transition-opacity duration-700 ${
          showKeyboardHint ? "opacity-100" : "opacity-0 pointer-events-none h-0 py-0 overflow-hidden"
        }`}
      >
        <p className="text-xs text-muted-foreground/70 tracking-wide">
          ← → Navigate&nbsp;&nbsp;|&nbsp;&nbsp;Space: Next&nbsp;&nbsp;|&nbsp;&nbsp;Esc: Exit
        </p>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={notesSidebarOpen ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setNotesSidebarOpen((v) => !v)}
                >
                  <StickyNote className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Notes</TooltipContent>
            </Tooltip>
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

      {/* ─── Study Timer (floating panel) ────────── */}
      <StudyTimer />
    </div>
  );
}

// ============================================
// Notes Sidebar Content (shared between desktop & mobile)
// ============================================

interface NotesSidebarContentProps {
  notes: { id: string; content: string; slideNumber: number; bookmarked: boolean; createdAt?: string }[];
  currentSlide: number;
  newNoteContent: string;
  savingNote: boolean;
  onContentChange: (v: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}

function NotesSidebarContent({
  notes,
  currentSlide,
  newNoteContent,
  savingNote,
  onContentChange,
  onCreate,
  onDelete,
  onToggleBookmark,
  endRef,
}: NotesSidebarContentProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onCreate();
    }
  };

  return (
    <>
      {/* Notes List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {notes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <StickyNote className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No notes yet.</p>
              <p className="text-xs text-muted-foreground/60">
                Add a note for slide {currentSlide + 1}.
              </p>
            </div>
          )}
          {notes.map((note) => (
            <div
              key={note.id}
              className="group relative rounded-lg border bg-background p-3 text-sm transition-colors hover:bg-muted/40"
            >
              {/* Slide badge */}
              <div className="flex items-center justify-between mb-1">
                <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  Slide {note.slideNumber}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-muted transition-colors"
                    onClick={() => onToggleBookmark(note.id)}
                    aria-label={note.bookmarked ? "Remove bookmark" : "Bookmark note"}
                  >
                    {note.bookmarked ? (
                      <BookmarkCheck className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-destructive/10 transition-colors"
                    onClick={() => onDelete(note.id)}
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-line">
                {note.content}
              </p>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* New Note Input */}
      <div className="shrink-0 border-t p-3">
        <div className="flex gap-2">
          <textarea
            value={newNoteContent}
            onChange={(e) => onContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Add a note for slide ${currentSlide + 1}…`}
            rows={2}
            className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <Button
            size="icon"
            className="h-auto w-9 shrink-0 self-end"
            onClick={onCreate}
            disabled={savingNote || !newNoteContent.trim()}
          >
            {savingNote ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

// ============================================
// Confetti Celebration Component
// ============================================

/** LMS color palette for confetti particles */
const CONFETTI_COLORS = [
  "#3882f6", // blue
  "#14b8a6", // teal
  "#22d3ee", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#6366f1", // indigo accent
  "#8b5cf6", // violet accent
  "#ec4899", // pink accent
];

type ParticleShape = "circle" | "rectangle" | "triangle";

interface ConfettiParticle {
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

function ConfettiCelebration() {
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
                style={{
                  left: `${p.left}%`,
                  "--confetti-color": p.color,
                  "--tri-size": `${p.size}px`,
                  "--fall-duration": p.fallDuration,
                  "--fall-delay": p.fallDelay,
                  "--drift": p.drift,
                  "--spin": p.spin,
                } as React.CSSProperties}
              />
            );
          }
          return (
            <div
              key={p.id}
              className={`confetti-particle ${p.shape === "circle" ? "confetti-circle" : "confetti-rectangle"}`}
              style={{
                left: `${p.left}%`,
                width: p.shape === "rectangle" ? `${p.size * 1.4}px` : `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.color,
                "--fall-duration": p.fallDuration,
                "--fall-delay": p.fallDelay,
                "--drift": p.drift,
                "--spin": p.spin,
              } as React.CSSProperties}
            />
          );
        })}
      </div>

      {/* Congratulations message */}
      <div className="confetti-message" role="status" aria-label="Congratulations!">
        <div className="confetti-message-text flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 dark:bg-zinc-800/90 shadow-lg">
            <span className="text-4xl">🎉</span>
          </div>
          <div className="rounded-2xl bg-white/90 dark:bg-zinc-800/90 px-8 py-5 shadow-xl text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              🎉 Congratulations!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;ve completed this section!
            </p>
          </div>
        </div>
      </div>
    </>
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
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10">
        <GraduationCap className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4 leading-tight">
        {slide.title}
      </h1>
      {slide.subtitle && (
        <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
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
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary to-accent" />
        <h2 className="text-2xl font-bold text-foreground">{slide.title}</h2>
      </div>
      {slide.items && slide.items.length > 0 && (
        <div className="space-y-5">
          {slide.items.map((item, i) => (
            <div key={i} className="rounded-lg bg-muted/40 p-4 transition-colors hover:bg-muted/60">
              {item.heading && (
                <h3 className="text-base font-semibold text-foreground mb-1.5">
                  {item.heading}
                </h3>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
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
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary to-accent" />
        <h2 className="text-2xl font-bold text-foreground">{slide.title}</h2>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/60 border-b border-border">
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-left font-semibold text-foreground whitespace-nowrap"
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
                className={ri < rows.length - 1 ? "border-b border-border" : ""}
              >
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-3 text-muted-foreground whitespace-nowrap">
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
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary to-accent" />
        <h2 className="text-2xl font-bold text-foreground">{slide.title}</h2>
      </div>
      {slide.items && slide.items.length > 0 && (
        <ul className="space-y-3">
          {slide.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 rounded-lg bg-muted/40 p-3 transition-colors hover:bg-muted/60">
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <div>
                {item.heading && (
                  <span className="font-semibold text-foreground text-sm">
                    {item.heading}{" "}
                  </span>
                )}
                <span className="text-sm text-muted-foreground leading-relaxed">
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
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary to-accent" />
        <h2 className="text-2xl font-bold text-foreground">{slide.title}</h2>
      </div>
      <div className="rounded-lg border border-border bg-zinc-900 overflow-hidden shadow-inner">
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-2">
          <span className="text-xs font-medium text-zinc-400">
            {slide.codeBlock.language}
          </span>
          <div className="flex gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500/60" />
            <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
            <span className="h-3 w-3 rounded-full bg-green-500/60" />
          </div>
        </div>
        <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
          <code className="text-zinc-100 font-mono">
            {slide.codeBlock.code}
          </code>
        </pre>
      </div>
    </div>
  );
}

// ─── Quiz Slide (Interactive) ────────────────────
function QuizSlide({ slide }: { slide: SlideContent }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const hasSubmitted = selectedIdx !== null;

  // Determine correct answer: look for item with icon === "check" or first item
  const correctIdx = slide.items?.findIndex((item) => item.icon === "check") ?? 0;
  const isCorrect = selectedIdx === correctIdx;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary to-accent" />
        <h2 className="text-2xl font-bold text-foreground">{slide.title}</h2>
      </div>
      {slide.items && slide.items.length > 0 && (
        <div className="space-y-3">
          {slide.items.map((item, i) => {
            const letter = String.fromCharCode(65 + i);
            const isSelected = selectedIdx === i;
            let borderColor = "border-border hover:border-primary/30 hover:bg-primary/5";
            if (hasSubmitted) {
              if (i === correctIdx) borderColor = "border-emerald-500 bg-emerald-500/10";
              else if (isSelected && !isCorrect) borderColor = "border-red-400 bg-red-400/10";
              else borderColor = "border-border opacity-60";
            } else if (isSelected) {
              borderColor = "border-primary bg-primary/10";
            }

            return (
              <button
                key={i}
                type="button"
                className={`w-full rounded-lg border p-4 text-left transition-all duration-200 ${borderColor}`}
                onClick={() => {
                  if (!hasSubmitted) setSelectedIdx(i);
                }}
                disabled={hasSubmitted}
              >
                <div className="flex items-start gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    hasSubmitted && i === correctIdx
                      ? "bg-emerald-500 text-white"
                      : hasSubmitted && isSelected && !isCorrect
                        ? "bg-red-400 text-white"
                        : "bg-primary/10 text-primary"
                  }`}>
                    {hasSubmitted && i === correctIdx ? "✓" : hasSubmitted && isSelected && !isCorrect ? "✗" : letter}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {item.heading || item.text}
                    </p>
                    {item.heading && item.text !== item.heading && (
                      <p className="text-xs text-muted-foreground mt-1">{item.text}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Feedback after selection */}
          {hasSubmitted && (
            <div className={`mt-4 rounded-lg border p-4 ${
              isCorrect
                ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/50"
                : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50"
            }`}>
              <p className={`text-sm font-semibold ${
                isCorrect ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
              }`}>
                {isCorrect ? "🎉 Correct! Well done!" : "❌ Not quite right."}
              </p>
              {!isCorrect && (
                <p className="mt-1 text-xs text-muted-foreground">
                  The correct answer is <strong>{String.fromCharCode(65 + correctIdx)}</strong>.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fallback Slide ───────────────────────────────
function FallbackSlide({ slide }: { slide: SlideContent }) {
  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary to-accent" />
        <h2 className="text-2xl font-bold text-foreground">{slide.title}</h2>
      </div>
      {slide.subtitle && (
        <p className="text-muted-foreground mb-4">{slide.subtitle}</p>
      )}
      {slide.items?.map((item, i) => (
        <p key={i} className="text-sm text-muted-foreground mb-2">
          {item.heading && <span className="font-semibold text-foreground">{item.heading}: </span>}
          {item.text}
        </p>
      ))}
    </div>
  );
}
