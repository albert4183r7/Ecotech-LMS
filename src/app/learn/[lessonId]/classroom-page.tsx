"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  MoveHorizontal,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  X,
  Loader2,
  StickyNote,
  Sparkles,
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
import { LessonAssistant } from "@/components/lms/classroom/lesson-assistant";
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
import { classroomPath, courseDetailPath, quizAttemptPath } from "@/lib/routes";
import { SLIDE_WIDTH, SLIDE_HEIGHT } from "@/lib/sanitize";
import { safeFileName, triggerDownload } from "@/lib/download";
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

const MIN_ZOOM = 25;
const MAX_ZOOM = 200;
const ZOOM_STEP = 25;

// Zoom is a percentage of the slide's authored size, so the wrapper can be
// sized in real pixels. A CSS transform leaves the layout box unchanged, which
// made the scroll container unable to reach anything a zoom pushed off-screen.
const SLIDE_NATURAL_WIDTH = SLIDE_WIDTH;
const SLIDE_NATURAL_HEIGHT = SLIDE_HEIGHT;

export function ClassroomPage() {
  const { goBack } = useNavigation();
  const router = useRouter();
  const { lessonId: routeLessonId } = useParams<{ lessonId: string }>();
  const {
    state: classroomState,
    slideId: loadedSlideId,
    slideContext: loadedSlideContext,
    loading: classroomLoading,
    error: classroomError,
  } = useClassroomState(routeLessonId);
  const userId = useUserStore((s) => s.currentUserId);
  const [localState, setLocalState] = useState<ClassroomState | null>(null);
  const [zoom, setZoom] = useState(100);
  // Set once the learner touches a zoom control, so an automatic fit never
  // overrides a deliberate choice on the next resize.
  const zoomIsUserChosenRef = useRef(false);
  const [navigating, setNavigating] = useState(false);
  const confettiShownRef = useRef(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // ─── Notes Sidebar State ──────────────────────
  const [notesSidebarOpen, setNotesSidebarOpen] = useState(false);
  // The two side panels share the same column, so opening one closes the
  // other rather than splitting the slide's width three ways.
  //
  // The assistant starts open on a desktop screen: it is there to be used
  // while the lesson is read, and behind an icon nobody clicked it was a
  // feature most learners never found. It closes from its own corner, and a
  // narrow screen has no room for it beside the slide.
  const [assistantOpen, setAssistantOpen] = useState(false);

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

  // ─── Slide viewport (measured by Fit Width) ───
  const viewportRef = useRef<HTMLDivElement>(null);
  const slideWrapRef = useRef<HTMLDivElement>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    setIsMobile(mq.matches);
    if (!mq.matches) setAssistantOpen(true);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // The side panels take the right edge, where the study timer and the
  // keyboard button are pinned. Publishing the open panel's width lets those
  // move clear instead of landing on the panel's own controls.
  useEffect(() => {
    const width = assistantOpen ? "24rem" : notesSidebarOpen ? "20rem" : "0px";
    document.documentElement.style.setProperty("--rail-offset", isMobile ? "0px" : width);
    return () => {
      document.documentElement.style.removeProperty("--rail-offset");
    };
  }, [assistantOpen, notesSidebarOpen, isMobile]);

  // Keep a working copy of classroomState
  useEffect(() => {
    if (classroomState) {
      setLocalState({ ...classroomState });
      zoomIsUserChosenRef.current = false;
      confettiShownRef.current = false;
      setShowConfetti(false);
    }
  }, [classroomState]);

  // ─── Lesson Navigation ─────────────────────────
  // Moving between lessons changes the URL; useClassroomState reloads from it,
  // which keeps the address bar correct and makes a lesson link shareable.
  //
  // replace, not push: stepping through lessons used to stack a history entry
  // per lesson, so leaving the classroom walked back through every lesson
  // visited. Replacing keeps the classroom as a single history entry, so the
  // browser's back button returns to wherever the learner entered from.
  const goToLesson = useCallback(
    (index: number) => {
      if (!localState || index < 0 || index >= localState.allLessonIds.length) return;
      const nextLessonId = localState.allLessonIds[index];
      if (nextLessonId === localState.lessonId) return;
      setNavigating(true);
      router.replace(classroomPath(nextLessonId));
    },
    [localState, router],
  );

  /**
   * Leave the classroom for the course it belongs to.
   *
   * This was router.back(), which is only the course page when the learner
   * arrived directly from it and has not moved between lessons since. Going to
   * the course explicitly makes Close mean the same thing every time.
   */
  const closeClassroom = useCallback(() => {
    if (localState?.courseId) {
      router.push(courseDetailPath(localState.courseId));
      return;
    }
    goBack();
  }, [localState?.courseId, router, goBack]);

  // Clear the navigating flag once the new lesson has loaded.
  useEffect(() => {
    setNavigating(false);
  }, [classroomState?.lessonId]);

  // The quiz belonging to this lesson, if the learner may take it. A lesson
  // without one (not generated, or the caller is its instructor) simply moves
  // on to the next lesson as before.
  const [lessonQuizId, setLessonQuizId] = useState<string | null>(null);
  useEffect(() => {
    const lessonId = classroomState?.lessonId;
    if (!lessonId) return;
    let cancelled = false;
    setLessonQuizId(null);
    (async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/quiz`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (json.success && json.data?.status === "READY" && !json.data.canEdit) {
          setLessonQuizId(json.data.id);
        }
      } catch {
        // No quiz simply means the lesson ends where it always did.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classroomState?.lessonId]);

  /** Mark lesson as completed and save progress */
  const markLessonCompleted = useCallback(
    async (lessonId: string, currentPage: number) => {
      if (!userId || !localState) return;
      try {
        const enrollRes = await fetch("/api/enrollments");
        const enrollJson = await enrollRes.json();
        if (enrollJson.success && Array.isArray(enrollJson.data)) {
          // The enrolments endpoint nests the course, so there is no
          // top-level courseId to match on. Matching one anyway found nothing,
          // every time — which is why a finished lesson never recorded any
          // progress and a course sat at 0% however much of it was read.
          const enrollment = enrollJson.data.find(
            (e: { id?: string; courseId?: string; course?: { id?: string } }) =>
              (e.course?.id ?? e.courseId) === localState.courseId,
          );
          if (enrollment) {
            await fetch("/api/progress", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                enrollmentId: enrollment.id,
                lessonId,
                currentPage,
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

  // Mark a multi-slide lesson complete once its last slide is reached. A
  // single-slide lesson needs an explicit Next action below; otherwise opening
  // it satisfies 0 >= 0 and completes it without any learner interaction.
  //
  // This used to fire on a 500ms timer as soon as the lesson opened, so simply
  // landing on a lesson marked it finished — a two-lesson course reported
  // itself complete the moment the second lesson loaded, before any of its
  // slides had been seen.
  const completedLessonsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!localState || !userId) return;
    if (localState.slides.length <= 1) return;
    const onLastSlide = localState.currentSlideIndex >= localState.slides.length - 1;
    if (!onLastSlide) return;
    if (completedLessonsRef.current.has(localState.lessonId)) return;
    completedLessonsRef.current.add(localState.lessonId);
    markLessonCompleted(localState.lessonId, localState.currentSlideIndex + 1);
  }, [
    localState?.lessonId,
    localState?.currentSlideIndex,
    localState?.slides.length,
    userId,
    markLessonCompleted,
  ]);

  // The slide currently on screen. Everything that used to read a single
  // htmlBody now goes through here.
  const currentSlide = localState?.slides[localState.currentSlideIndex] ?? null;

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
    if (
      localState.slides.length === 1 &&
      !completedLessonsRef.current.has(localState.lessonId)
    ) {
      completedLessonsRef.current.add(localState.lessonId);
      void markLessonCompleted(localState.lessonId, 1);
    }
    // The lesson is finished. Its quiz comes before the next lesson does —
    // moving straight on would skip the check the lesson was building to.
    if (lessonQuizId) {
      router.push(quizAttemptPath(lessonQuizId));
      return;
    }
    goToLesson(localState.currentLessonIndex + 1);
  }, [localState, goToLesson, lessonQuizId, router, markLessonCompleted]);

  // ─── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          closeClassroom();
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
  }, [closeClassroom, goPrev, goNext]);

  /** The space the slide has to live in, inside the viewport's padding. */
  const measureViewport = useCallback((): { width: number; height: number } | null => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    const style = getComputedStyle(viewport);
    const width =
      viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height =
      viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    return width > 0 && height > 0 ? { width, height } : null;
  }, []);

  const clampZoom = (pct: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(pct)));

  /** Zoom at which the whole slide is visible, both dimensions. */
  const fitAllZoom = useCallback((): number | null => {
    const box = measureViewport();
    if (!box) return null;
    return clampZoom(
      Math.min(box.width / SLIDE_NATURAL_WIDTH, box.height / SLIDE_NATURAL_HEIGHT) * 100,
    );
  }, [measureViewport]);

  const chooseZoom = useCallback((next: number | ((current: number) => number)) => {
    zoomIsUserChosenRef.current = true;
    setZoom((current) => (typeof next === "function" ? next(current) : next));
  }, []);

  const zoomIn = () => chooseZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  const zoomOut = () => chooseZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));

  /** Back to the slide's authored size, whether or not it then fits. */
  const zoomReset = () => chooseZoom(100);

  /** Fill the available width, letting the slide run past the fold if it must. */
  const zoomFitWidth = useCallback(() => {
    const box = measureViewport();
    if (!box) return;
    chooseZoom(clampZoom((box.width / SLIDE_NATURAL_WIDTH) * 100));
  }, [measureViewport, chooseZoom]);

  /** Show the whole slide. */
  const zoomFitAll = useCallback(() => {
    const fit = fitAllZoom();
    if (fit !== null) chooseZoom(fit);
  }, [fitAllZoom, chooseZoom]);

  // Open at a zoom that shows the entire slide, and keep that promise as the
  // window resizes — but only while the learner has not chosen a zoom of their
  // own, so a deliberate zoom is never yanked back on a resize.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const apply = () => {
      if (zoomIsUserChosenRef.current) return;
      const fit = fitAllZoom();
      if (fit !== null) setZoom(fit);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitAllZoom, localState?.lessonId]);

  // ─── Confetti on last lesson ─────────────────
  useEffect(() => {
    if (!localState) return;
    const totalLessons = localState.allLessonIds.length;
    const isOnLastLesson = totalLessons > 0 && localState.currentLessonIndex === totalLessons - 1;
    // The course is finished at the end of the last lesson, not on reaching it.
    const isOnLastSlide = localState.currentSlideIndex >= localState.slides.length - 1;
    if (isOnLastLesson && isOnLastSlide && !confettiShownRef.current) {
      confettiShownRef.current = true;
      setShowConfetti(true);
      toast.success("🎉 You completed the course! Great job!");
      const timer = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(timer);
    }
  }, [localState?.currentLessonIndex, localState?.currentSlideIndex, localState?.slides.length]);

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

  // ─── Download this lesson as PPTX ─────────────────
  //
  // Sending courseId exported every lesson in the course as one combined deck,
  // which is not what a button inside a single lesson should do. It now sends
  // the slides of the lesson on screen, so each lesson exports to its own file.
  const handleDownloadPptx = useCallback(async () => {
    if (!localState || downloadingPptx) return;
    setDownloadingPptx(true);
    try {
      const res = await fetch("/api/courses/export-pptx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: localState.lessonId,
          deckName: localState.lessonTitle,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        toast.error(json?.error || "Failed to generate PPT");
        return;
      }
      triggerDownload(await res.blob(), `${safeFileName(localState.lessonTitle)}.pptx`);
      toast.success("PPT downloaded successfully!");
    } catch {
      toast.error("Failed to download PPT");
    } finally {
      setDownloadingPptx(false);
    }
  }, [localState, downloadingPptx]);

  // ─── Load failure ───────────────────────────────
  // The hook has always reported why a lesson could not be loaded; this page
  // ignored it and showed the spinner below forever. A lesson that was
  // deleted, unpublished, or that the learner is no longer enrolled in now
  // says so and offers the way out, instead of hanging.
  if (classroomError) {
    return (
      <div className="bg-muted/30 flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted-foreground text-lg">{classroomError}</p>
        <p className="text-muted-foreground/80 max-w-md text-sm">
          The lesson may have been removed, or it may belong to a course you are not enrolled in.
        </p>
        <Button variant="outline" onClick={goBack}>
          Go back
        </Button>
      </div>
    );
  }

  // ─── No state guard ─────────────────────────────
  // Still loading, or loaded into nothing: either way there is no lesson to
  // draw yet, and the error branch above has already handled failure.
  if (!localState) {
    return (
      <div className="bg-muted/30 flex h-screen flex-col items-center justify-center gap-3">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        {!classroomLoading && (
          <p className="text-muted-foreground text-sm">Preparing this lesson…</p>
        )}
      </div>
    );
  }

  const totalLessons = localState.allLessonIds.length;
  const currentIdx = localState.currentLessonIndex;
  // Both buttons step slides first and only change lesson at a boundary, so
  // they may only be disabled at the very ends of the whole course. Testing
  // the lesson index alone disabled Previous for every slide of lesson 1 and
  // disabled Next for every slide of the last lesson.
  const isFirst = currentIdx === 0 && localState.currentSlideIndex === 0;
  /** On the last slide of this lesson, whichever lesson it is. */
  const atLessonEnd = localState.currentSlideIndex >= localState.slides.length - 1;
  const atCourseEnd = totalLessons > 0 && currentIdx >= totalLessons - 1 && atLessonEnd;
  // The quiz is where a finished lesson goes, so Next still has somewhere to
  // take the learner at the end of the last lesson. Disabling it there — which
  // it did — made the final lesson's quiz unreachable: the button that leads
  // to it was the one being switched off.
  const quizAhead = atLessonEnd && lessonQuizId !== null;
  const isLast = atCourseEnd && !quizAhead;
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

      {/* ─── Mobile Assistant Sheet ───────────────── */}
      <Sheet
        open={assistantOpen && isMobile}
        onOpenChange={(open) => {
          if (!open) setAssistantOpen(false);
        }}
      >
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-sm">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Lesson Assistant
            </SheetTitle>
            <SheetDescription>Ask about {localState.lessonTitle}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <LessonAssistant
              key={localState.lessonId}
              lessonId={localState.lessonId}
              lessonTitle={localState.lessonTitle}
              currentSlideNumber={localState.currentSlideIndex + 1}
            />
          </div>
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
        {/*
          The slide was capped at max-w-3xl (768px) and scaled with a CSS
          transform, so a 1280px slide rendered at 60% — small enough to be
          unreadable — and a transform leaves the layout box unchanged, so
          nothing a zoom pushed off-screen could be scrolled to. The wrapper is
          now sized in real pixels from the zoom, and the viewport centres it
          and scrolls when it does not fit.
        */}
        <div ref={viewportRef} className="grid flex-1 place-items-center overflow-auto p-4 sm:p-6">
          <div
            ref={slideWrapRef}
            className="bg-card paper-texture overflow-hidden rounded-2xl border shadow-lg ring-1 ring-black/5 dark:ring-white/5"
            style={{
              width: (SLIDE_NATURAL_WIDTH * zoom) / 100,
              aspectRatio: `${SLIDE_NATURAL_WIDTH} / ${SLIDE_NATURAL_HEIGHT}`,
            }}
          >
            {navigating ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
              </div>
            ) : (
              <iframe
                ref={iframeRef}
                srcDoc={currentSlide?.htmlBody || ""}
                // No allow-same-origin: nothing here reads into the frame, and
                // the pair "allow-same-origin allow-scripts" would put slide
                // content on the app's own origin, where a script in it could
                // read the session cookie and call the API as the learner.
                // allow-scripts alone still runs the wrapper's fit script.
                sandbox="allow-scripts"
                className="h-full w-full border-0"
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

        {/* ─── Desktop AI Assistant (slide-in panel) ── */}
        <aside
          className={`bg-card hidden shrink-0 flex-col overflow-hidden border-l transition-all duration-300 ease-in-out lg:flex ${
            assistantOpen ? "w-96 opacity-100" : "w-0 border-l-0 opacity-0"
          }`}
          aria-label="Lesson assistant"
        >
          <div className="flex h-full w-96 flex-col">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="text-primary h-4 w-4" />
                <span className="text-sm font-semibold">Study Assistant</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                aria-label="Close the study assistant"
                onClick={() => setAssistantOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Keyed by lesson: moving on starts a new conversation rather
                than carrying the last lesson's answers into this one. */}
            <LessonAssistant
              key={localState.lessonId}
              lessonId={localState.lessonId}
              lessonTitle={localState.lessonTitle}
              currentSlideNumber={localState.currentSlideIndex + 1}
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomFitAll}>
                  <Maximize2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit Slide</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomFitWidth}>
                  <MoveHorizontal className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fit Width</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomReset}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Actual Size (100%)</TooltipContent>
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
              <TooltipContent>Download this lesson as PPT</TooltipContent>
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
              variant={quizAhead ? "default" : "outline"}
              size="sm"
              className={`gap-1.5 transition-opacity ${
                isLast || navigating ? "cursor-not-allowed opacity-40" : ""
              }`}
              onClick={goNext}
              disabled={isLast || navigating}
            >
              <span className="hidden sm:inline">{quizAhead ? "Take the quiz" : "Next"}</span>
              {quizAhead ? (
                <ClipboardCheck className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Close + Assistant + Notes Toggle */}
          <div className="flex items-center gap-3">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={assistantOpen ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  aria-label={
                    assistantOpen ? "Hide the study assistant" : "Ask the study assistant"
                  }
                  onClick={() => {
                    setAssistantOpen((v) => !v);
                    setNotesSidebarOpen(false);
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ask about this lesson</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={notesSidebarOpen ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8"
                  aria-label={notesSidebarOpen ? "Hide notes" : "Open notes"}
                  onClick={() => {
                    setNotesSidebarOpen((v) => !v);
                    setAssistantOpen(false);
                  }}
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
              onClick={closeClassroom}
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
