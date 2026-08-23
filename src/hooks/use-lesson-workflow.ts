"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_SLIDE_COUNT, DEFAULT_STYLE } from "@/lib/slide-styles";
import type {
  OutlineLessonDraft,
  OutlineSlideDraft,
  SlideGenState,
} from "@/components/lms/create-course/outline-lesson-card";
import { MAX_LESSONS, toLessonDraft } from "@/components/lms/create-course/model";
import type { LoadedLessons } from "@/hooks/use-course-draft";
import type { ReferenceFile } from "@/hooks/use-course-uploads";

// ============================================
// The lesson workflow behind the Create Course page
//
// One workflow, in the order the instructor walks it: plan an outline, edit
// it, then generate its slides and quiz while polling for progress. These
// stages share the lesson list, which is why they are one hook rather than
// three — splitting them would mean passing that list back and forth.
//
// What it does not own is the course record. The id, the language and the
// draft-save it needs before an outline can be attached all arrive as
// arguments, so this never writes to the form.
// ============================================

export interface UseLessonWorkflowOptions {
  /** The saved course, or null before the first save. */
  courseId: string | null;
  /** The course's language, the default for a new outline. */
  language: string;
  /** Saves the course as a draft if it is not saved yet, and returns its id. */
  ensureCourseSaved: () => Promise<string | null>;
  /** Reference documents to ground the outline in. */
  referenceFiles: ReferenceFile[];
  setReferenceFiles: (files: ReferenceFile[]) => void;
  /** The lessons of a reopened course, once the course hook has read them. */
  loadedLessons: LoadedLessons | null;
}

export function useLessonWorkflow({
  courseId,
  language,
  ensureCourseSaved,
  referenceFiles,
  setReferenceFiles,
  loadedLessons,
}: UseLessonWorkflowOptions) {
  // ---- Outline modal ----
  const [modalOpen, setModalOpen] = useState(false);
  const [outlineTopic, setOutlineTopic] = useState("");
  const [outlineSlideCount, setOutlineSlideCount] = useState(DEFAULT_SLIDE_COUNT);
  const [outlineLanguage, setOutlineLanguage] = useState(language);
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [editingOutlineLesson, setEditingOutlineLesson] = useState<string | null>(null);
  const [outlineEditingSlides, setOutlineEditingSlides] = useState<OutlineSlideDraft[]>([]);

  // ---- Lessons ----
  const [outlineLessons, setOutlineLessons] = useState<OutlineLessonDraft[]>([]);
  const [expandedOutlineLessonId, setExpandedOutlineLessonId] = useState<string | null>(null);

  // ---- Slide generation ----
  const [generatingLessonId, setGeneratingLessonId] = useState<string | null>(null);
  const [slideGenStates, setSlideGenStates] = useState<Record<string, SlideGenState>>({});
  // Which stage of the generation workflow is running, so the UI can say
  // "writing the quiz" rather than appearing to hang after the last slide.
  const [genStage, setGenStage] = useState<"idle" | "slides" | "quiz">("idle");
  const [currentGenSlideId, setCurrentGenSlideId] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const abortGenRef = useRef<AbortController | null>(null);
  const slideGenStatesRef = useRef<Record<string, SlideGenState>>({});

  // Keep ref in sync with state for polling callbacks
  useEffect(() => {
    slideGenStatesRef.current = slideGenStates;
  }, [slideGenStates]);

  // Adopt the lessons of a course being reopened. Set once, when the course
  // hook finishes reading it.
  useEffect(() => {
    if (!loadedLessons) return;
    setOutlineLessons(loadedLessons.lessons);
    setSlideGenStates(loadedLessons.slideStates);
    if (loadedLessons.lessons.length > 0) {
      setExpandedOutlineLessonId(loadedLessons.lessons[0].id);
    }
  }, [loadedLessons]);

  // ---- Open modal for new outline ----
  const handleOpenModal = () => {
    setOutlineTopic("");
    setOutlineSlideCount(DEFAULT_SLIDE_COUNT);
    setOutlineLanguage(language);
    setOutlineGenerating(false);
    setEditingOutlineLesson(null);
    setOutlineEditingSlides([]);
    setReferenceFiles([]);
    setModalOpen(true);
  };

  // ---- Generate outline ----
  const handleGenerateOutline = useCallback(async () => {
    if (!outlineTopic.trim()) {
      toast.error("Prompt is required");
      return;
    }
    if (outlineLessons.length >= MAX_LESSONS) {
      toast.error(`Maximum ${MAX_LESSONS} lessons allowed`);
      return;
    }

    const savedCourseId = await ensureCourseSaved();
    if (!savedCourseId) return;

    setOutlineGenerating(true);
    try {
      const res = await fetch("/api/lessons/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: savedCourseId,
          topic: outlineTopic.trim(),
          slideCount: outlineSlideCount,
          language: outlineLanguage,
          referenceFileUrls:
            referenceFiles.length > 0 ? referenceFiles.map((f) => f.url) : undefined,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error || "Failed to generate outline");
        setOutlineGenerating(false);
        return;
      }

      const { lesson: newLesson, slides } = toLessonDraft(json.data, {
        language: outlineLanguage,
        style: DEFAULT_STYLE,
        topic: outlineTopic.trim(),
      });

      setOutlineLessons((prev) => [...prev, newLesson]);
      setEditingOutlineLesson(newLesson.id);
      setOutlineEditingSlides(slides);
      setOutlineGenerating(false);
      toast.success(
        `Plan ready: ${newLesson.sections?.length ?? 0} sections across ${slides.length} slides`,
      );
    } catch {
      toast.error("Failed to generate outline. Please try again.");
      setOutlineGenerating(false);
    }
  }, [
    outlineTopic,
    outlineSlideCount,
    outlineLanguage,
    referenceFiles,
    ensureCourseSaved,
    outlineLessons.length,
  ]);

  // ---- Update lesson title (in outline modal) ----
  const handleUpdateLessonTitle = async (lessonId: string, newTitle: string) => {
    setOutlineLessons((prev) =>
      prev.map((ol) => (ol.id === lessonId ? { ...ol, title: newTitle } : ol)),
    );
    try {
      await fetch(`/api/lessons/${lessonId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {
      // silent
    }
  };

  // ---- Update slide title (inline edit) ----
  const handleUpdateSlideTitle = async (slideId: string, newTitle: string) => {
    setOutlineEditingSlides((prev) =>
      prev.map((s) => (s.slideId === slideId ? { ...s, title: newTitle } : s)),
    );
    setOutlineLessons((prev) =>
      prev.map((ol) =>
        ol.id === editingOutlineLesson
          ? {
              ...ol,
              slides: ol.slides.map((s) => (s.slideId === slideId ? { ...s, title: newTitle } : s)),
            }
          : ol,
      ),
    );
    try {
      await fetch(`/api/slides/${slideId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {
      // silent
    }
  };

  // ---- Delete a slide from outline ----
  const handleDeleteOutlineSlide = async (slideId: string, localId: string) => {
    setOutlineEditingSlides((prev) => prev.filter((s) => s.id !== localId));
    setOutlineLessons((prev) =>
      prev.map((ol) =>
        ol.id === editingOutlineLesson
          ? { ...ol, slides: ol.slides.filter((s) => s.id !== localId) }
          : ol,
      ),
    );
    if (slideId) {
      try {
        await fetch(`/api/slides/${slideId}`, { method: "DELETE" });
      } catch {
        // silent
      }
    }
  };

  // ---- Add a blank slide to outline ----
  const handleAddOutlineSlide = () => {
    const newOrder = outlineEditingSlides.length;
    const localId = `local_${Date.now()}_new`;
    const newSlide: OutlineSlideDraft = {
      id: localId,
      slideId: null,
      title: `Slide ${newOrder + 1}`,
      outline: "",
      order: newOrder,
    };
    setOutlineEditingSlides((prev) => [...prev, newSlide]);
    setOutlineLessons((prev) =>
      prev.map((ol) =>
        ol.id === editingOutlineLesson ? { ...ol, slides: [...ol.slides, newSlide] } : ol,
      ),
    );
  };

  // ---- Regenerate outline ----
  const handleRegenerateOutline = async () => {
    if (!editingOutlineLesson) return;
    setOutlineGenerating(true);
    try {
      const res = await fetch("/api/lessons/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          topic: outlineTopic.trim(),
          slideCount: outlineSlideCount,
          language: outlineLanguage,
          existingLessonId: editingOutlineLesson,
          referenceFileUrls:
            referenceFiles.length > 0 ? referenceFiles.map((f) => f.url) : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Failed to regenerate");
        setOutlineGenerating(false);
        return;
      }
      const { lesson: regenerated, slides } = toLessonDraft(json.data, {
        language: outlineLanguage,
        style: DEFAULT_STYLE,
        topic: outlineTopic.trim(),
      });
      setOutlineEditingSlides(slides);
      setOutlineLessons((prev) =>
        prev.map((ol) => (ol.id === editingOutlineLesson ? { ...ol, ...regenerated } : ol)),
      );
      setOutlineGenerating(false);
      toast.success(
        `Plan regenerated: ${regenerated.sections?.length ?? 0} sections across ${slides.length} slides`,
      );
    } catch {
      toast.error("Failed to regenerate outline");
      setOutlineGenerating(false);
    }
  };

  // ============================================
  // GENERATE SLIDES — Polling approach (proxy-safe)
  // ============================================

  const handleGenerateSlides = useCallback(
    async (lessonId: string) => {
      const lesson = outlineLessons.find((l) => l.id === lessonId);
      if (!lesson) return;
      if (lesson.slides.length === 0) {
        toast.error("No slides to generate");
        return;
      }

      // Initialize per-slide gen states
      const initialStates: Record<string, SlideGenState> = {};
      lesson.slides.forEach((s) => {
        if (s.slideId) {
          initialStates[s.slideId] = { status: "pending" };
        }
      });
      setSlideGenStates(initialStates);
      setGeneratingLessonId(lessonId);
      setGenStage("slides");
      setCurrentGenSlideId(null);
      setGenProgress({ current: 0, total: lesson.slides.length });
      setExpandedOutlineLessonId(lessonId);

      // Close modal if open
      setModalOpen(false);

      try {
        // Start generation (returns immediately)
        const res = await fetch("/api/lessons/generate-slides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            language: lesson.language,
          }),
        });

        const json = await res.json();
        if (!json.success) {
          toast.error(json.error || "Failed to start slide generation");
          setGeneratingLessonId(null);
          setGenStage("idle");
          return;
        }

        // Poll for slide status every 3 seconds
        const totalSlides = json.data.totalSlides;
        let completedCount = 0;
        let errorCount = 0;
        let pollInterval: ReturnType<typeof setInterval> | null = null;
        let stopped = false;

        const poll = async () => {
          try {
            const pollRes = await fetch(`/api/lessons/${lessonId}`);
            const pollJson = await pollRes.json();
            if (!pollJson.success || !pollJson.data?.slides) return;

            const dbSlides = pollJson.data.slides;
            let currentGenId: string | null = null;
            let newCompleted = 0;
            let newErrors = 0;

            const newStates: Record<string, SlideGenState> = {};
            for (const s of dbSlides) {
              const prevState = slideGenStatesRef.current[s.id];
              if (s.status === "GENERATING") {
                currentGenId = s.id;
                newStates[s.id] = { status: "generating" };
              } else if (s.status === "READY") {
                newCompleted++;
                // Fetch the htmlBody from DB for completed slides
                newStates[s.id] = {
                  status: "complete",
                  htmlBody: prevState?.htmlBody || s.htmlBody || "",
                };
              } else if (s.status === "ERROR") {
                newErrors++;
                newStates[s.id] = { status: "error", error: "Generation failed" };
              } else {
                newStates[s.id] = prevState || { status: "pending" };
              }
            }

            // Merge with existing states to preserve already-loaded htmlBody
            setSlideGenStates((prev) => {
              const merged: Record<string, SlideGenState> = {};
              for (const [id, state] of Object.entries(prev)) {
                merged[id] = state;
              }
              for (const [id, state] of Object.entries(newStates)) {
                // For READY slides, fetch htmlBody if we don't have it yet
                if (state.status === "complete" && !state.htmlBody) {
                  const dbSlide = dbSlides.find((s) => s.id === id);
                  merged[id] = { ...state, htmlBody: dbSlide?.htmlBody || "" };
                } else {
                  merged[id] = state;
                }
              }
              return merged;
            });

            if (currentGenId) {
              setCurrentGenSlideId(currentGenId);
            }

            completedCount = newCompleted;
            errorCount = newErrors;
            setGenProgress({ current: newCompleted + newErrors, total: totalSlides });

            // Slides are only the first stage. The quiz is written from them
            // afterwards, in the same server-side workflow, so declaring
            // success here left the instructor on a preview with no quiz and
            // a button suggesting they generate it by hand.
            const slidesDone = newCompleted + newErrors >= totalSlides;
            const quiz = pollJson.data.quiz as {
              status: string;
              questionCount: number;
              error: string | null;
            } | null;
            const quizSettled = quiz?.status === "READY" || quiz?.status === "ERROR";
            // A lesson whose slides all failed never starts a quiz, so waiting
            // for one would hang the UI.
            const quizExpected = newCompleted > 0;
            const allDone = slidesDone && (!quizExpected || quizSettled);

            if (slidesDone && !quizSettled && quizExpected) {
              setGenStage("quiz");
            }

            if (allDone && !stopped) {
              stopped = true;
              if (pollInterval) clearInterval(pollInterval);
              setGeneratingLessonId(null);
              setGenStage("idle");
              setCurrentGenSlideId(null);
              setGenStage("idle");
              abortGenRef.current = null;

              if (newErrors > 0) {
                toast.warning(
                  `${newCompleted} of ${totalSlides} slides generated. ${newErrors} failed.`,
                );
              } else if (quiz?.status === "ERROR") {
                toast.warning(
                  `All ${newCompleted} slides generated, but the quiz could not be built. You can retry it from the preview.`,
                );
              } else {
                toast.success(
                  `All ${newCompleted} slides generated` +
                    (quiz?.questionCount ? `, with a ${quiz.questionCount}-question quiz.` : "."),
                );
              }

              setOutlineLessons((prev) =>
                prev.map((ol) =>
                  ol.id === lessonId ? { ...ol, allReady: newCompleted === totalSlides } : ol,
                ),
              );
            }
          } catch (pollErr) {
            console.error("[generate-slides] Poll error:", pollErr);
          }
        };

        // Store ref for polling access
        slideGenStatesRef.current = initialStates;
        pollInterval = setInterval(poll, 3000);
        // Also poll immediately after a short delay
        setTimeout(poll, 2000);

        // Store interval ref for cleanup on cancel
        abortGenRef.current = {
          abort: () => {
            stopped = true;
            if (pollInterval) clearInterval(pollInterval);
            setGeneratingLessonId(null);
            setGenStage("idle");
            setCurrentGenSlideId(null);
          },
        } as unknown as AbortController;
      } catch {
        toast.error("Failed to generate slides. Please try again.");
        setGeneratingLessonId(null);
        setGenStage("idle");
        setCurrentGenSlideId(null);
        abortGenRef.current = null;
      }
    },
    [outlineLessons],
  );

  const handleCancelGeneration = () => {
    abortGenRef.current?.abort();
    setGeneratingLessonId(null);
    setGenStage("idle");
    setCurrentGenSlideId(null);
    toast.info("Generation will continue in background. Refresh to see updated slides.");
  };

  // ---- Delete lesson ----
  const handleDeleteOutlineLesson = async (lessonId: string) => {
    setOutlineLessons((prev) => prev.filter((ol) => ol.id !== lessonId));
    if (expandedOutlineLessonId === lessonId) {
      setExpandedOutlineLessonId(null);
    }
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) toast.error("Failed to remove lesson");
    } catch {
      toast.error("Failed to remove lesson");
    }
  };

  return {
    // outline modal
    modalOpen,
    setModalOpen,
    outlineTopic,
    setOutlineTopic,
    outlineSlideCount,
    setOutlineSlideCount,
    outlineLanguage,
    setOutlineLanguage,
    outlineGenerating,
    editingOutlineLesson,
    setEditingOutlineLesson,
    outlineEditingSlides,
    setOutlineEditingSlides,
    // lessons
    outlineLessons,
    setOutlineLessons,
    expandedOutlineLessonId,
    setExpandedOutlineLessonId,
    // slide generation
    generatingLessonId,
    slideGenStates,
    genStage,
    currentGenSlideId,
    genProgress,
    // actions
    handleOpenModal,
    handleGenerateOutline,
    handleRegenerateOutline,
    handleUpdateLessonTitle,
    handleUpdateSlideTitle,
    handleDeleteOutlineSlide,
    handleAddOutlineSlide,
    handleDeleteOutlineLesson,
    handleGenerateSlides,
    handleCancelGeneration,
  };
}
