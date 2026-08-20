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
  Loader2,
  StickyNote,
  Bookmark,
  BookmarkCheck,
  Trash2,
  Send,
  FileDown,
  Wand2,
  Pencil,
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
import { Textarea } from "@/components/ui/textarea";
import { useUserStore } from "@/stores/lms-store";
import { useNavigation } from "@/hooks/use-navigation";
import { useClassroomState } from "@/hooks/use-classroom-state";
import { useParams, useRouter } from "next/navigation";
import { classroomPath } from "@/lib/routes";
import type { ClassroomState } from "@/types/lms";
import { StudyTimer } from "@/components/lms/study-timer";
import {
  NotesSidebarContent,
  NotesSidebarContentProps,
} from "@/components/lms/classroom/notes-sidebar";
import {
  ConfettiCelebration,
  CONFETTI_COLORS,
  ConfettiParticle,
  ParticleShape,
} from "@/components/lms/classroom/confetti-celebration";
import { useLessonNotes } from "@/hooks/use-lesson-notes";

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

export function ClassroomPage() {
  const { goBack } = useNavigation();
  const router = useRouter();
  const { lessonId: routeLessonId } = useParams<{ lessonId: string }>();
  const {
    state: classroomState,
    slideId: loadedSlideId,
    slideContext: loadedSlideContext,
  } = useClassroomState(routeLessonId);
  const userId = useUserStore((s) => s.currentUserId);
  const [localState, setLocalState] = useState<ClassroomState | null>(null);
  const [zoom, setZoom] = useState(100);
  const [navigating, setNavigating] = useState(false);
  const confettiShownRef = useRef(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ─── Notes Sidebar State ──────────────────────
  const [notesSidebarOpen, setNotesSidebarOpen] = useState(false);

  const {
    notes,
    newNoteContent,
    setNewNoteContent,
    savingNote,
    notesEndRef,
    createNote,
    deleteNote,
    toggleBookmark,
  } = useLessonNotes({
    userId,
    courseId: classroomState?.courseId,
    lessonId: classroomState?.lessonId,
    slideNumber: (classroomState?.currentSlideIndex ?? 0) + 1,
    enabled: notesSidebarOpen,
  });

  // ─── Keyboard Hint Fade ────────────────────────
  const [showKeyboardHint, setShowKeyboardHint] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [downloadingPptx, setDownloadingPptx] = useState(false);

  // ─── AI Edit State ─────────────────────────────
  const [showAiEdit, setShowAiEdit] = useState(false);
  const [aiEditInstruction, setAiEditInstruction] = useState("");
  const [aiEditLoading, setAiEditLoading] = useState(false);

  // ─── Click-to-Edit State ──────────────────────
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentSlideIdRef = useRef<string | null>(null);
  const slideContextRef = useRef<string>("");
  const [elementEdit, setElementEdit] = useState<{
    show: boolean;
    targetElement: Element | null;
    outerHTML: string;
    position: { x: number; y: number };
    instruction: string;
    loading: boolean;
  }>({
    show: false,
    targetElement: null,
    outerHTML: "",
    position: { x: 0, y: 0 },
    instruction: "",
    loading: false,
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Seed the refs the classroom loader resolved for the initial slide.
  useEffect(() => {
    if (loadedSlideId) currentSlideIdRef.current = loadedSlideId;
    if (loadedSlideContext) slideContextRef.current = loadedSlideContext;
  }, [loadedSlideId, loadedSlideContext]);

  // Keep a working copy of classroomState
  useEffect(() => {
    if (classroomState) {
      setLocalState({ ...classroomState });
      setZoom(100);
      confettiShownRef.current = false;
      setShowConfetti(false);
    }
  }, [classroomState]);

  // ─── Lesson Navigation ─────────────────────────
  // Moving between lessons changes the URL; useClassroomState reloads from it.
  // This keeps the address bar correct and makes browser back work inside the
  // classroom.
  const goToLesson = useCallback(
    (index: number) => {
      if (!localState || index < 0 || index >= localState.allLessonIds.length) return;
      const nextLessonId = localState.allLessonIds[index];
      if (nextLessonId === localState.lessonId) return;
      setNavigating(true);
      router.push(classroomPath(nextLessonId));
    },
    [localState, router],
  );

  // Clear the navigating flag once the new lesson has loaded.
  useEffect(() => {
    setNavigating(false);
  }, [classroomState?.lessonId]);

  /** Mark lesson as completed and save progress */
  const markLessonCompleted = useCallback(
    async (lessonId: string) => {
      if (!userId || !localState) return;
      try {
        const enrollRes = await fetch(`/api/enrollments?userId=${userId}`);
        const enrollJson = await enrollRes.json();
        if (enrollJson.success && Array.isArray(enrollJson.data)) {
          const enrollment = enrollJson.data.find(
            (e: Record<string, unknown>) => e.courseId === localState.courseId,
          );
          if (enrollment) {
            await fetch("/api/progress", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                enrollmentId: enrollment.id,
                lessonId,
                currentPage: 1,
                completed: true,
              }),
            });
          }
        }
      } catch {
        /* best-effort */
      }
    },
    [userId, localState],
  );

  // Save progress when lesson changes
  useEffect(() => {
    if (!localState || !userId) return;
    const timer = setTimeout(() => {
      markLessonCompleted(localState.lessonId);
    }, 500);
    return () => clearTimeout(timer);
  }, [localState?.currentLessonIndex, userId, markLessonCompleted]);

  // The slide currently on screen. Everything that used to read a single
  // htmlBody now goes through here.
  const currentSlide = localState?.slides[localState.currentSlideIndex] ?? null;

  /** Replace the on-screen slide's HTML, in state and on the server. */
  const applySlideHtml = useCallback((updatedHtmlBody: string) => {
    setLocalState((prev) => {
      if (!prev) return prev;
      const slides = prev.slides.map((slide, i) =>
        i === prev.currentSlideIndex ? { ...slide, htmlBody: updatedHtmlBody } : slide,
      );
      return { ...prev, slides };
    });
  }, []);

  /** Step through slides; at either end, move to the neighbouring lesson. */
  const goPrev = useCallback(() => {
    if (!localState) return;
    if (localState.currentSlideIndex > 0) {
      setLocalState((prev) =>
        prev ? { ...prev, currentSlideIndex: prev.currentSlideIndex - 1 } : prev,
      );
      return;
    }
    goToLesson(localState.currentLessonIndex - 1);
  }, [localState, goToLesson]);

  const goNext = useCallback(() => {
    if (!localState) return;
    if (localState.currentSlideIndex < localState.slides.length - 1) {
      setLocalState((prev) =>
        prev ? { ...prev, currentSlideIndex: prev.currentSlideIndex + 1 } : prev,
      );
      return;
    }
    goToLesson(localState.currentLessonIndex + 1);
  }, [localState, goToLesson]);

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

  // ─── Iframe Click-to-Edit Listener ─────────────
  // Attaches a click listener to the iframe's document body.
  // With sandbox="allow-same-origin allow-scripts", the parent can access iframe.contentDocument directly.
  // No sandbox change needed — direct DOM access is safe under allow-same-origin.
  const handleIframeClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target || target.tagName === "BODY" || target.tagName === "HTML") return;

    const iframe = iframeRef.current;
    if (!iframe?.contentDocument || !iframe.contentWindow) return;

    // Capture the element reference and its outerHTML
    const outerHTML = target.outerHTML;

    // Map click coordinates from iframe viewport to parent viewport
    // accounting for zoom transform on the container
    const iframeRect = iframe.getBoundingClientRect();
    const iframeWidth = iframe.contentWindow.innerWidth;
    const iframeHeight = iframe.contentWindow.innerHeight;
    const scaleX = iframeRect.width / iframeWidth;
    const scaleY = iframeRect.height / iframeHeight;
    const pageX = iframeRect.left + e.clientX * scaleX;
    const pageY = iframeRect.top + e.clientY * scaleY;

    // Position toolbar slightly offset from click
    const toolbarX = Math.min(pageX + 10, window.innerWidth - 300);
    const toolbarY = Math.min(pageY - 10, window.innerHeight - 120);

    setElementEdit({
      show: true,
      targetElement: target,
      outerHTML,
      position: { x: Math.max(10, toolbarX), y: Math.max(10, toolbarY) },
      instruction: "",
      loading: false,
    });
  }, []);

  const attachIframeClickListener = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentDocument?.body) return;

    const body = iframe.contentDocument.body;
    // Remove any previously attached listener to avoid duplicates
    body.removeEventListener("click", handleIframeClick);
    body.addEventListener("click", handleIframeClick);
  }, [handleIframeClick]);

  // Re-attach click listener when htmlBody changes (new slide loaded)
  useEffect(() => {
    // Small delay to ensure iframe has rendered the new srcDoc
    const timer = setTimeout(attachIframeClickListener, 300);
    return () => clearTimeout(timer);
  }, [currentSlide?.htmlBody, attachIframeClickListener]);

  // Close element edit toolbar on Escape
  useEffect(() => {
    if (!elementEdit.show) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setElementEdit((prev) => ({ ...prev, show: false, instruction: "" }));
      }
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [elementEdit.show]);

  /** Submit element edit: call API, replace in DOM, persist */
  const handleElementEdit = useCallback(async () => {
    if (!elementEdit.targetElement || elementEdit.loading || !elementEdit.instruction.trim())
      return;

    setElementEdit((prev) => ({ ...prev, loading: true }));

    try {
      const res = await fetch("/api/slides/element-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          elementHtml: elementEdit.outerHTML,
          instruction: elementEdit.instruction.trim(),
          slideContext: slideContextRef.current,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        toast.error(errJson?.error || "Element edit failed");
        return;
      }

      const json = await res.json();
      if (!json.success || !json.data?.replacementHtml) {
        toast.error("Element edit returned no content");
        return;
      }

      const replacementHtml = json.data.replacementHtml;

      // Replace the element in the iframe DOM
      const iframe = iframeRef.current;
      if (iframe?.contentDocument && elementEdit.targetElement) {
        // Verify the element is still in the DOM (user may have navigated)
        if (iframe.contentDocument.contains(elementEdit.targetElement)) {
          const tempDiv = iframe.contentDocument.createElement("div");
          tempDiv.innerHTML = replacementHtml;
          const newElement = tempDiv.firstElementChild;
          if (newElement) {
            elementEdit.targetElement.replaceWith(newElement);
          }
        }

        // Rebuild full HTML from the updated iframe DOM
        const bodyHtml = iframe.contentDocument.body.innerHTML;
        const title = localState?.lessonTitle || "Slide";
        const safeTitle = title
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
        const updatedHtmlBody = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${safeTitle}</title>\n  <script src="https://cdn.tailwindcss.com"><\/script>\n  <style>\n    body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }\n    * { box-sizing: border-box; }\n  </style>\n</head>\n<body class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">\n  ${bodyHtml}\n</body>\n</html>`;

        // Update local state
        applySlideHtml(updatedHtmlBody);

        // Persist to database
        const slideId = currentSlideIdRef.current;
        if (slideId) {
          fetch(`/api/slides/${slideId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ htmlBody: updatedHtmlBody }),
          }).catch(() => {
            /* best-effort */
          });
        }

        // Re-attach click listener for the new DOM
        setTimeout(attachIframeClickListener, 100);

        toast.success("Element edited successfully");
      }
    } catch {
      toast.error("Element edit request failed");
    } finally {
      setElementEdit({
        show: false,
        targetElement: null,
        outerHTML: "",
        position: { x: 0, y: 0 },
        instruction: "",
        loading: false,
      });
    }
  }, [elementEdit, localState?.lessonTitle, attachIframeClickListener]);

  /** Zoom controls */
  const zoomIn = () => setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  const zoomOut = () => setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  const zoomFit = () => setZoom(100);

  // ─── Confetti on last lesson ─────────────────
  useEffect(() => {
    if (!localState) return;
    const totalLessons = localState.allLessonIds.length;
    const isOnLastLesson = totalLessons > 0 && localState.currentLessonIndex === totalLessons - 1;
    if (isOnLastLesson && !confettiShownRef.current) {
      confettiShownRef.current = true;
      setShowConfetti(true);
      toast.success("🎉 You completed the course! Great job!");
      const timer = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [localState?.currentLessonIndex]);

  // Reset confetti flag when classroom state changes (new course)
  useEffect(() => {
    confettiShownRef.current = false;
    setShowConfetti(false);
  }, [classroomState?.courseId]);

  // ─── Keyboard Hint Auto-Fade ────────────────────
  useEffect(() => {
    setShowKeyboardHint(true);
    const timer = setTimeout(() => setShowKeyboardHint(false), 5000);
    return () => clearTimeout(timer);
  }, [localState?.lessonId]);

  // ─── Download as PPTX ─────────────────────────────
  const handleDownloadPptx = useCallback(async () => {
    if (!localState || downloadingPptx) return;
    setDownloadingPptx(true);
    try {
      const res = await fetch("/api/courses/export-pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: localState.courseId,
          courseName: localState.courseTitle,
        }),
      });
      if (!res.ok) {
        toast.error("Failed to generate PPT");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = localState.courseTitle
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase()
        .slice(0, 60);
      a.download = `${safeName}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PPT downloaded successfully!");
    } catch {
      toast.error("Failed to download PPT");
    } finally {
      setDownloadingPptx(false);
    }
  }, [localState, downloadingPptx]);

  // ─── AI Inline Edit ──────────────────────────────
  const handleAiEdit = useCallback(async () => {
    if (!localState || aiEditLoading || !aiEditInstruction.trim()) return;
    setAiEditLoading(true);
    try {
      const res = await fetch("/api/slides/inline-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlBody: currentSlide?.htmlBody ?? "",
          instruction: aiEditInstruction.trim(),
          slideTitle: localState.lessonTitle,
        }),
      });
      if (!res.ok) {
        toast.error("AI edit failed");
        return;
      }
      const json = await res.json();
      if (json.success && json.data?.htmlBody) {
        const newHtmlBody = json.data.htmlBody;
        applySlideHtml(newHtmlBody);
        toast.success("AI edit applied");
        // Persist to database
        try {
          await fetch(`/api/lessons/${localState.lessonId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ htmlBody: newHtmlBody }),
          });
        } catch {
          /* best-effort save */
        }
      } else {
        toast.error("AI edit returned no content");
      }
    } catch {
      toast.error("AI edit request failed");
    } finally {
      setAiEditLoading(false);
      setShowAiEdit(false);
      setAiEditInstruction("");
    }
  }, [localState, aiEditLoading, aiEditInstruction]);

  // ─── No state guard ─────────────────────────────
  if (!localState) {
    return (
      <div className="bg-muted/30 flex h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  const totalLessons = localState.allLessonIds.length;
  const currentIdx = localState.currentLessonIndex;
  const isFirst = currentIdx === 0;
  const isLast = totalLessons > 0 && currentIdx >= totalLessons - 1;
  const progressPercent =
    totalLessons > 1 ? Math.round(((currentIdx + 1) / totalLessons) * 100) : 100;

  return (
    <div className="bg-muted/30 relative flex h-screen flex-col">
      {/* ─── Mobile Notes Sheet ──────────────────── */}
      <Sheet
        open={notesSidebarOpen && isMobile}
        onOpenChange={(open) => {
          if (!open) setNotesSidebarOpen(false);
        }}
      >
        <SheetContent side="right" className="w-full p-0 sm:max-w-sm">
          <SheetHeader className="px-4 pt-4 pb-0">
            <SheetTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4" />
              Notes
            </SheetTitle>
            <SheetDescription>
              Notes for lesson {currentIdx + 1} of {totalLessons}
            </SheetDescription>
          </SheetHeader>
          <NotesSidebarContent
            notes={notes}
            currentLessonIndex={currentIdx}
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
      <div className="bg-muted h-1 w-full shrink-0 overflow-hidden">
        <div
          className="from-primary to-accent h-full bg-gradient-to-r transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ─── Top Bar ──────────────────────────────── */}
      <header className="bg-card flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
        {/* Logo, Lesson Title, Course Title */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <img
              src="/ecotech-logo.png"
              alt="Ecotech"
              className="h-7 w-7 rounded-md object-contain"
            />
            <img
              src="/ecotech-name.png"
              alt="Ecotech"
              className="hidden h-5 w-auto object-contain sm:inline"
            />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <h2 className="text-foreground truncate text-sm leading-tight font-medium">
              {localState.lessonTitle}
            </h2>
            <p className="text-muted-foreground truncate text-xs leading-tight">
              {localState.courseTitle}
            </p>
          </div>
        </div>

        {/* Position: slide within the lesson, and the lesson within the course */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="bg-primary/10 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm tabular-nums">
            <span className="font-semibold">Slide {localState.currentSlideIndex + 1}</span>
            <span className="text-primary/40 font-normal">of</span>
            <span className="font-semibold">{localState.slides.length}</span>
          </span>
          {totalLessons > 1 && (
            <span className="text-muted-foreground inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs tabular-nums">
              Lesson {currentIdx + 1}/{totalLessons}
            </span>
          )}
        </div>
      </header>

      {/* ─── Main Layout: Content + Desktop Notes Sidebar ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Lesson Content Area ────────────────── */}
        <div className="flex flex-1 flex-col items-center overflow-auto px-4 py-8 sm:px-6">
          <div
            className="bg-card paper-texture w-full max-w-3xl overflow-hidden rounded-2xl border shadow-lg ring-1 ring-black/5 dark:ring-white/5"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top center",
            }}
          >
            {navigating ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                srcDoc={currentSlide?.htmlBody || ""}
                sandbox="allow-same-origin allow-scripts"
                className="w-full rounded-lg border-0"
                style={{ aspectRatio: "16/9" }}
                title={`${localState.lessonTitle || "Slide"} content`}
              />
            )}
          </div>
        </div>

        {/* ─── Desktop Notes Sidebar (slide-in panel) ── */}
        <aside
          className={`bg-card hidden shrink-0 flex-col overflow-hidden border-l transition-all duration-300 ease-in-out lg:flex ${
            notesSidebarOpen ? "w-80 opacity-100" : "w-0 border-l-0 opacity-0"
          }`}
        >
          <div className="flex h-full w-80 flex-col">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <StickyNote className="text-primary h-4 w-4" />
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
              currentLessonIndex={currentIdx}
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
        className={`frosted-glass shrink-0 border-t px-4 py-1.5 text-center transition-opacity duration-700 ${
          showKeyboardHint
            ? "opacity-100"
            : "pointer-events-none h-0 overflow-hidden py-0 opacity-0"
        }`}
      >
        <p className="text-muted-foreground/70 text-xs tracking-wide">
          ← → Navigate&nbsp;&nbsp;|&nbsp;&nbsp;Space: Next&nbsp;&nbsp;|&nbsp;&nbsp;Esc: Exit
        </p>
      </div>

      {/* ─── Bottom Controls (Frosted Glass) ───────── */}
      <footer className="frosted-glass shrink-0 border-t">
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

            <span className="text-muted-foreground w-12 text-center text-xs font-medium tabular-nums">
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomFit}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit Width</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomFit}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset Zoom</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleDownloadPptx}
                  disabled={downloadingPptx}
                >
                  {downloadingPptx ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download as PPT</TooltipContent>
            </Tooltip>
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 transition-opacity ${
                isFirst || navigating ? "cursor-not-allowed opacity-40" : ""
              }`}
              onClick={goPrev}
              disabled={isFirst || navigating}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className={`gap-1.5 transition-opacity ${
                isLast || navigating ? "cursor-not-allowed opacity-40" : ""
              }`}
              onClick={goNext}
              disabled={isLast || navigating}
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Close + Notes Toggle */}
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
            <span className="text-muted-foreground hidden text-xs lg:inline">
              ← → navigate, ESC exit
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground gap-1.5"
              onClick={goBack}
            >
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Close</span>
            </Button>
          </div>
        </div>
      </footer>

      {/* ─── Click-to-Edit Floating Toolbar ── */}
      {elementEdit.show && (
        <div
          className="bg-card fixed z-50 flex w-72 flex-col gap-2 rounded-lg border p-3 shadow-xl"
          style={{
            left: elementEdit.position.x,
            top: elementEdit.position.y,
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-semibold">
              <Pencil className="h-3.5 w-3.5" />
              Edit Element
            </h3>
            <button
              type="button"
              className="hover:bg-muted rounded p-0.5 transition-colors"
              onClick={() =>
                setElementEdit((prev) => ({
                  ...prev,
                  show: false,
                  instruction: "",
                }))
              }
              aria-label="Close element edit"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            type="text"
            value={elementEdit.instruction}
            onChange={(e) =>
              setElementEdit((prev) => ({
                ...prev,
                instruction: e.target.value,
              }))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleElementEdit();
              }
            }}
            placeholder="e.g. make this shorter"
            className="bg-background placeholder:text-muted-foreground/50 focus:ring-primary/20 w-full rounded-md border px-2.5 py-1.5 text-sm focus:ring-2 focus:outline-none"
            autoFocus
            disabled={elementEdit.loading}
          />
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={handleElementEdit}
              disabled={elementEdit.loading || !elementEdit.instruction.trim()}
            >
              {elementEdit.loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Pencil className="h-3 w-3" />
              )}
              Apply
            </Button>
          </div>
        </div>
      )}

      {/* ─── AI Edit Floating Panel ────────── */}
      {showAiEdit && (
        <div className="bg-card fixed right-4 bottom-20 z-50 flex w-72 flex-col gap-3 rounded-lg border p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Wand2 className="text-primary h-4 w-4" />
              AI Edit
            </h3>
          </div>
          <Textarea
            value={aiEditInstruction}
            onChange={(e) => setAiEditInstruction(e.target.value)}
            placeholder="Describe the edit you want…"
            rows={3}
            className="resize-none text-sm"
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowAiEdit(false);
                setAiEditInstruction("");
              }}
              disabled={aiEditLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleAiEdit}
              disabled={aiEditLoading || !aiEditInstruction.trim()}
            >
              {aiEditLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply
            </Button>
          </div>
        </div>
      )}
      <Button
        className="fixed right-4 bottom-4 z-50 h-10 w-10 rounded-full shadow-lg"
        size="icon"
        onClick={() => setShowAiEdit((v) => !v)}
        aria-label="Toggle AI Edit"
      >
        <Wand2 className="h-4 w-4" />
      </Button>

      {/* ─── Study Timer (floating panel) ────────── */}
      <StudyTimer />
    </div>
  );
}

// ============================================
// Notes Sidebar Content (shared between desktop & mobile)
// ============================================
