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
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import type { ClassroomState } from "@/types/lms";
import { StudyTimer } from "@/components/lms/study-timer";

const MIN_ZOOM = 50;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

export function ClassroomPage() {
  const { classroomState, goBack } = useNavigationStore();
  const userId = useUserStore((s) => s.currentUserId);
  const [localState, setLocalState] = useState<ClassroomState | null>(null);
  const [zoom, setZoom] = useState(100);
  const [navigating, setNavigating] = useState(false);
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
  const goToLesson = useCallback(
    async (index: number) => {
      if (!localState || index < 0 || index >= localState.allLessonIds.length) return;
      const lessonId = localState.allLessonIds[index];
      try {
        setNavigating(true);
        const res = await fetch(`/api/lessons/${lessonId}`);
        if (!res.ok) return;
        const json = await res.json();
        const slideData =
          json.success && json.data.slides?.length > 0
            ? json.data.slides[0]
            : null;
        const htmlBody = slideData?.htmlBody
            || '<div class="flex items-center justify-center h-full"><p class="text-gray-500">No content available.</p></div>';
        const lessonTitle =
          json.success && json.data.title
            ? json.data.title
            : `Lesson ${index + 1}`;
        // Track slide ID for element-edit persistence
        if (slideData?.id) currentSlideIdRef.current = slideData.id;
        // Extract slide style context from outlineJson
        if (json.data.outlineJson) {
          try {
            const outline = JSON.parse(json.data.outlineJson);
            const style = outline.style || "";
            const topic = outline.topic || lessonTitle;
            slideContextRef.current = `This is a ${style ? style + "-style" : ""} slide about "${topic}". Keep edits visually consistent with this style.`;
          } catch { /* ignore parse errors */ }
        }
        setLocalState((prev) =>
          prev
            ? {
                ...prev,
                lessonId,
                lessonTitle,
                htmlBody,
                currentLessonIndex: index,
              }
            : prev
        );
      } catch {
        /* silently fail */
      } finally {
        setNavigating(false);
      }
    },
    [localState]
  );

  /** Mark lesson as completed and save progress */
  const markLessonCompleted = useCallback(
    async (lessonId: string) => {
      if (!userId || !localState) return;
      try {
        const enrollRes = await fetch(`/api/enrollments?userId=${userId}`);
        const enrollJson = await enrollRes.json();
        if (enrollJson.success && Array.isArray(enrollJson.data)) {
          const enrollment = enrollJson.data.find(
            (e: Record<string, unknown>) => e.courseId === localState.courseId
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
    [userId, localState]
  );

  // Save progress when lesson changes
  useEffect(() => {
    if (!localState || !userId) return;
    const timer = setTimeout(() => {
      markLessonCompleted(localState.lessonId);
    }, 500);
    return () => clearTimeout(timer);
  }, [localState?.currentLessonIndex, userId, markLessonCompleted]);

  const goPrev = () => {
    if (!localState) return;
    goToLesson(localState.currentLessonIndex - 1);
  };
  const goNext = () => {
    if (!localState) return;
    goToLesson(localState.currentLessonIndex + 1);
  };

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
  const handleIframeClick = useCallback(
    (e: MouseEvent) => {
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
    },
    []
  );

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
  }, [localState?.htmlBody, attachIframeClickListener]);

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
    if (
      !elementEdit.targetElement ||
      elementEdit.loading ||
      !elementEdit.instruction.trim()
    )
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
        const updatedHtmlBody =
          `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${safeTitle}</title>\n  <script src="https://cdn.tailwindcss.com"><\/script>\n  <style>\n    body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }\n    * { box-sizing: border-box; }\n  </style>\n</head>\n<body class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">\n  ${bodyHtml}\n</body>\n</html>`;

        // Update local state
        setLocalState((prev) =>
          prev ? { ...prev, htmlBody: updatedHtmlBody } : prev
        );

        // Persist to database
        const slideId = currentSlideIdRef.current;
        if (slideId) {
          fetch(`/api/slides/${slideId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ htmlBody: updatedHtmlBody }),
          }).catch(() => { /* best-effort */ });
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
    const isOnLastLesson =
      totalLessons > 0 &&
      localState.currentLessonIndex === totalLessons - 1;
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

  // ─── Notes CRUD ─────────────────────────────────
  const fetchNotes = useCallback(async () => {
    if (!localState || !userId) return;
    try {
      const res = await fetch(
        `/api/notes?userId=${userId}&courseId=${localState.courseId}&lessonId=${localState.lessonId}`
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
  }, [notesSidebarOpen, fetchNotes, localState?.lessonId]);

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
          lessonId: localState.lessonId,
          content: newNoteContent.trim(),
          slideNumber: localState.currentLessonIndex + 1,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setNotes((prev) => [...prev, json.data]);
        setNewNoteContent("");
        setTimeout(
          () => notesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
          50
        );
      }
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }, [localState, userId, newNoteContent]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/notes?id=${noteId}`, {
        method: "DELETE",
      });
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

  // ─── Download as PPTX ─────────────────────────────
  const handleDownloadPptx = useCallback(async () => {
    if (!localState || downloadingPptx) return;
    setDownloadingPptx(true);
    try {
      const res = await fetch("/api/generate-pptx", {
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
      const res = await fetch("/api/generate-slide-inline-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          htmlBody: localState.htmlBody,
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
        setLocalState((prev) =>
          prev ? { ...prev, htmlBody: newHtmlBody } : prev
        );
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
      <div className="flex h-screen items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalLessons = localState.allLessonIds.length;
  const currentIdx = localState.currentLessonIndex;
  const isFirst = currentIdx === 0;
  const isLast = totalLessons > 0 && currentIdx >= totalLessons - 1;
  const progressPercent =
    totalLessons > 1
      ? Math.round(((currentIdx + 1) / totalLessons) * 100)
      : 100;

  return (
    <div className="flex h-screen flex-col bg-muted/30 relative">
      {/* ─── Mobile Notes Sheet ──────────────────── */}
      <Sheet
        open={notesSidebarOpen && isMobile}
        onOpenChange={(open) => {
          if (!open) setNotesSidebarOpen(false);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-sm p-0">
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
      <div className="shrink-0 h-1 w-full bg-muted overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ─── Top Bar ──────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-4 sm:px-6">
        {/* Logo, Lesson Title, Course Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <img
              src="/ecotech-logo.png"
              alt="Ecotech"
              className="h-7 w-7 rounded-md object-contain"
            />
            <img
              src="/ecotech-name.png"
              alt="Ecotech"
              className="h-5 w-auto hidden sm:inline object-contain"
            />
          </div>
          <Separator orientation="vertical" className="h-5" />
          <div className="min-w-0">
            <h2 className="text-sm font-medium text-foreground truncate leading-tight">
              {localState.lessonTitle}
            </h2>
            <p className="text-xs text-muted-foreground truncate leading-tight">
              {localState.courseTitle}
            </p>
          </div>
        </div>

        {/* Lesson Counter */}
        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary tabular-nums">
          <span className="font-semibold">
            Lesson {currentIdx + 1}
          </span>
          <span className="text-primary/40 font-normal">of</span>
          <span className="font-semibold">{totalLessons}</span>
        </span>
      </header>

      {/* ─── Main Layout: Content + Desktop Notes Sidebar ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ─── Lesson Content Area ────────────────── */}
        <div className="flex-1 overflow-auto flex flex-col items-center py-8 px-4 sm:px-6">
          <div
            className="bg-card rounded-2xl shadow-lg border w-full max-w-3xl ring-1 ring-black/5 dark:ring-white/5 paper-texture overflow-hidden"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top center",
            }}
          >
            {navigating ? (
              <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                srcDoc={localState.htmlBody || ""}
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
          className={`hidden lg:flex flex-col shrink-0 border-l bg-card transition-all duration-300 ease-in-out overflow-hidden ${
            notesSidebarOpen
              ? "w-80 opacity-100"
              : "w-0 opacity-0 border-l-0"
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
        className={`shrink-0 frosted-glass border-t px-4 py-1.5 text-center transition-opacity duration-700 ${
          showKeyboardHint
            ? "opacity-100"
            : "opacity-0 pointer-events-none h-0 py-0 overflow-hidden"
        }`}
      >
        <p className="text-xs text-muted-foreground/70 tracking-wide">
          ← → Navigate&nbsp;&nbsp;|&nbsp;&nbsp;Space:
          Next&nbsp;&nbsp;|&nbsp;&nbsp;Esc: Exit
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
                isFirst || navigating
                  ? "opacity-40 cursor-not-allowed"
                  : ""
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
                isLast || navigating
                  ? "opacity-40 cursor-not-allowed"
                  : ""
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

      {/* ─── Click-to-Edit Floating Toolbar ── */}
      {elementEdit.show && (
        <div
          className="fixed z-50 w-72 rounded-lg border bg-card shadow-xl p-3 flex flex-col gap-2"
          style={{
            left: elementEdit.position.x,
            top: elementEdit.position.y,
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
              <Pencil className="h-3.5 w-3.5" />
              Edit Element
            </h3>
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted transition-colors"
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
            className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
            autoFocus
            disabled={elementEdit.loading}
          />
          <div className="flex items-center justify-end">
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
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
        <div className="fixed bottom-20 right-4 z-50 w-72 rounded-lg border bg-card shadow-lg p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Wand2 className="h-4 w-4 text-primary" />
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
        className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full shadow-lg"
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

interface NotesSidebarContentProps {
  notes: {
    id: string;
    content: string;
    slideNumber: number;
    bookmarked: boolean;
    createdAt?: string;
  }[];
  currentLessonIndex: number;
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
  currentLessonIndex,
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
              <p className="text-xs text-muted-foreground">
                No notes yet.
              </p>
              <p className="text-xs text-muted-foreground/60">
                Add a note for lesson {currentLessonIndex + 1}.
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
                    aria-label={
                      note.bookmarked
                        ? "Remove bookmark"
                        : "Bookmark note"
                    }
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
            placeholder={`Add a note for lesson ${currentLessonIndex + 1}…`}
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
      const shape =
        shapes[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2];
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
              className={`confetti-particle ${
                p.shape === "circle"
                  ? "confetti-circle"
                  : "confetti-rectangle"
              }`}
              style={{
                left: `${p.left}%`,
                width:
                  p.shape === "rectangle"
                    ? `${p.size * 1.4}px`
                    : `${p.size}px`,
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
      <div
        className="confetti-message"
        role="status"
        aria-label="Congratulations!"
      >
        <div className="confetti-message-text flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/90 dark:bg-zinc-800/90 shadow-lg">
            <span className="text-4xl">🎉</span>
          </div>
          <div className="rounded-2xl bg-white/90 dark:bg-zinc-800/90 px-8 py-5 shadow-xl text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
              🎉 Congratulations!
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;ve completed this lesson!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
