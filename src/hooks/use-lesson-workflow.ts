"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DEFAULT_QUIZ_QUESTIONS, DEFAULT_SLIDE_COUNT, DEFAULT_STYLE } from "@/lib/slide-styles";
import type {
  GenStage,
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

/** How often the page asks the server where generation has got to. */
const POLL_INTERVAL_MS = 1500;

/**
 * Failed polls in a row before the page stops asking.
 *
 * Enough to ride out a restart or a dropped request, few enough that a route
 * the server genuinely cannot answer is reported in seconds rather than
 * filling the console until the tab is closed.
 */
const MAX_POLL_FAILURES = 5;

/** The answer /api/lessons/[id]/progress gives: statuses, never markup. */
interface LessonProgress {
  stage: "slides" | "media" | "ready" | "failed";
  done: boolean;
  totalSlides: number;
  readySlides: number;
  errorSlides: number;
  generatingSlideId: string | null;
  slides: { id: string; title: string; status: string; order: number }[];
  quiz: { id: string; status: string; error: string | null; questionCount: number } | null;
  video: {
    id: string;
    status: string;
    error: string | null;
    readyScenes: number;
    errorScenes: number;
    totalScenes: number;
  } | null;
}

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
  /** How many quiz questions the lesson should get. */
  const [outlineQuestionCount, setOutlineQuestionCount] = useState(DEFAULT_QUIZ_QUESTIONS);
  const [outlineLanguage, setOutlineLanguage] = useState(language);
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [editingOutlineLesson, setEditingOutlineLesson] = useState<string | null>(null);
  const [outlineEditingSlides, setOutlineEditingSlides] = useState<OutlineSlideDraft[]>([]);

  // ---- Slide count recommendation ----
  //
  // When the AI planner decides the topic needs more slides than the user
  // requested, this surfaces the recommendation so the UI can ask rather than
  // silently compressing the content.
  const [slideCountSuggestion, setSlideCountSuggestion] = useState<{
    lessonId: string;
    requested: number;
    recommended: number;
  } | null>(null);

  // ---- Lessons ----
  const [outlineLessons, setOutlineLessons] = useState<OutlineLessonDraft[]>([]);
  const [expandedOutlineLessonId, setExpandedOutlineLessonId] = useState<string | null>(null);

  // ---- Slide generation ----
  const [generatingLessonId, setGeneratingLessonId] = useState<string | null>(null);
  const [slideGenStates, setSlideGenStates] = useState<Record<string, SlideGenState>>({});
  // Which stage of the generation workflow is running, so the UI can say
  // "writing the quiz" rather than appearing to hang after the last slide.
  const [genStage, setGenStage] = useState<GenStage>("idle");
  const [currentGenSlideId, setCurrentGenSlideId] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  // True while the generated HTML is being fetched, so the card can say the
  // deck is loading instead of showing an empty space where it will appear.
  const [slidesLoading, setSlidesLoading] = useState(false);
  // Seconds left, estimated from how long the finished slides actually took.
  // A figure printed before anything has finished would be a guess about the
  // gateway's speed today, so nothing is shown until there is evidence.
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const genStartedAtRef = useRef<number | null>(null);
  const abortGenRef = useRef<AbortController | null>(null);
  const slideGenStatesRef = useRef<Record<string, SlideGenState>>({});
  /** The running progress poll, so it can be stopped from anywhere. */
  const pollControlRef = useRef<{ stop: () => void } | null>(null);

  // ---- Slide HTML, fetched only when there is something new to show ----
  //
  // Polling used to read /api/lessons/[id], which returns every slide's full
  // HTML document. That answer grew with the deck and was re-sent every few
  // seconds, so "the slides are ready" reached the page long after they were.
  // The poll now reads statuses only, and the markup is fetched here: once as
  // soon as the first slide is ready, and once more at the end, because the
  // review pass rewrites some slides after they first report READY.
  const loadSlideHtml = useCallback(async (lessonId: string) => {
    setSlidesLoading(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}`);
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data?.slides)) return;
      const html = new Map<string, string>(
        (json.data.slides as { id: string; htmlBody?: string; status: string }[])
          .filter((s) => s.status === "READY" && s.htmlBody)
          .map((s) => [s.id, s.htmlBody as string]),
      );
      setSlideGenStates((prev) => {
        const merged: Record<string, SlideGenState> = { ...prev };
        for (const [id, htmlBody] of html) {
          merged[id] = { ...(merged[id] ?? { status: "complete" }), status: "complete", htmlBody };
        }
        return merged;
      });
    } catch (error) {
      console.error("[generate-slides] Could not load slide HTML:", error);
    } finally {
      setSlidesLoading(false);
    }
  }, []);

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
          quizQuestionCount: outlineQuestionCount,
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

      // When the planner says the topic needs more slides than the user asked
      // for, surface the recommendation instead of silently compressing.
      const recommended = json.data?.recommendedSlides as number | undefined;
      if (
        recommended &&
        recommended > outlineSlideCount + 1 &&
        json.data?.id
      ) {
        setSlideCountSuggestion({
          lessonId: json.data.id as string,
          requested: outlineSlideCount,
          recommended,
        });
        toast.success(
          `Plan ready — the AI recommends ${recommended} slides for this topic`,
        );
      } else {
        toast.success(
          `Plan ready: ${newLesson.sections?.length ?? 0} sections across ${slides.length} slides`,
        );
      }
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
          quizQuestionCount: outlineQuestionCount,
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

  // ---- Accept the AI's recommended slide count ----
  //
  // Regenerates the outline with the recommended count so the content gets the
  // room it needs, rather than being silently compressed.
  const handleAcceptRecommendedSlides = useCallback(async () => {
    if (!slideCountSuggestion) return;
    const { lessonId, recommended } = slideCountSuggestion;
    setSlideCountSuggestion(null);
    setOutlineSlideCount(recommended);
    setOutlineGenerating(true);
    try {
      const res = await fetch("/api/lessons/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          topic: outlineTopic.trim(),
          slideCount: recommended,
          quizQuestionCount: outlineQuestionCount,
          language: outlineLanguage,
          existingLessonId: lessonId,
          referenceFileUrls:
            referenceFiles.length > 0 ? referenceFiles.map((f) => f.url) : undefined,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Failed to regenerate with recommended slides");
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
        prev.map((ol) => (ol.id === lessonId ? { ...ol, ...regenerated } : ol)),
      );
      setOutlineGenerating(false);
      toast.success(
        `Plan updated to ${recommended} slides: ${regenerated.sections?.length ?? 0} sections`,
      );
    } catch {
      toast.error("Failed to regenerate outline. Please try again.");
      setOutlineGenerating(false);
    }
  }, [slideCountSuggestion, courseId, outlineTopic, outlineQuestionCount, outlineLanguage, referenceFiles]);

  // ---- Decline the recommendation, keep the current outline ----
  const handleDeclineSuggestion = useCallback(() => {
    setSlideCountSuggestion(null);
    toast.success("Outline kept as planned");
  }, []);

  // ============================================
  // GENERATE SLIDES — Polling approach (proxy-safe)
  // ============================================

  /**
   * Follow one lesson through generation until the server says it is finished.
   *
   * Kept apart from starting a generation because the two are not the same
   * thing: reopening a course whose lesson is still being written has to watch
   * it without starting it again.
   */
  const startProgressPolling = useCallback(
    (lessonId: string) => {
      // One lesson at a time; a second loop would fight the first for state.
      pollControlRef.current?.stop();

      let stopped = false;
      let pollInterval: ReturnType<typeof setInterval> | null = null;
      // Whether the markup of the first finished slide has been asked for.
      let htmlRequested = false;
      // Consecutive failed polls. Generation runs on the server and survives
      // this page, so a poll that cannot be answered is not a reason to fail
      // the lesson — but it is a reason to stop asking and say so, rather than
      // logging the same error every second and a half for the rest of the run.
      let consecutiveFailures = 0;

      const stop = () => {
        stopped = true;
        if (pollInterval) clearInterval(pollInterval);
        pollInterval = null;
      };

      const poll = async () => {
        try {
          const pollRes = await fetch(`/api/lessons/${lessonId}/progress`);

          // Anything but a JSON answer is a failure of the request, not a
          // report about the lesson. Reading .json() on an HTML error page
          // throws a parse error that says nothing about what went wrong —
          // "Unexpected token '<'" is what a 404 page looks like from here.
          if (!pollRes.ok) {
            throw new Error(
              `progress request failed with ${pollRes.status}` +
                (pollRes.status === 404
                  ? " — the lesson could not be read, or the dev server has not picked up this route yet"
                  : ""),
            );
          }

          const pollJson = await pollRes.json();
          consecutiveFailures = 0;
          if (stopped || !pollJson.success || !pollJson.data?.slides) return;
          const progress = pollJson.data as LessonProgress;

          const nextStates: Record<string, SlideGenState> = {};
          for (const slide of progress.slides) {
            const previous = slideGenStatesRef.current[slide.id];
            if (slide.status === "GENERATING") {
              nextStates[slide.id] = { status: "generating", htmlBody: previous?.htmlBody };
            } else if (slide.status === "READY") {
              // The markup arrives from loadSlideHtml, not from the poll —
              // carrying it here is what made every poll a full deck download.
              nextStates[slide.id] = { status: "complete", htmlBody: previous?.htmlBody };
            } else if (slide.status === "ERROR") {
              nextStates[slide.id] = { status: "error", error: "Generation failed" };
            } else {
              nextStates[slide.id] = previous ?? { status: "pending" };
            }
          }

          slideGenStatesRef.current = nextStates;
          setSlideGenStates((prev) => ({ ...prev, ...nextStates }));

          setCurrentGenSlideId(progress.generatingSlideId);
          const settled = progress.readySlides + progress.errorSlides;
          setGenProgress({ current: settled, total: progress.totalSlides });

          // Measured, not assumed: slides are written several at a time and
          // the gateway's pace varies by the hour, so the only honest estimate
          // is the rate this run is actually achieving.
          const startedAt = genStartedAtRef.current;
          if (progress.done) {
            setEtaSeconds(null);
          } else if (startedAt && settled > 0) {
            const perSlide = (Date.now() - startedAt) / 1000 / settled;
            const slidesLeft = Math.max(0, progress.totalSlides - settled);
            // The review pass and the quiz still follow the last slide, and
            // between them they cost roughly what three slides do.
            setEtaSeconds(Math.round(perSlide * (slidesLeft + 3)));
          }
          // Slides are only the first stage. The deck is reviewed and the quiz
          // written from it afterwards, in the same server-side workflow, so
          // declaring success at the last slide left the instructor on a
          // preview with no quiz — and naming the stage is what stops a
          // finished deck from looking stuck.
          setGenStage(progress.done ? "idle" : progress.stage === "slides" ? "slides" : "media");

          // Show the deck the moment there is one, rather than at the end of a
          // workflow whose remaining stages take as long as the slides did.
          if (!htmlRequested && progress.readySlides > 0) {
            htmlRequested = true;
            void loadSlideHtml(lessonId);
          }

          if (progress.done) {
            stop();
            setGeneratingLessonId(null);
            setGenStage("idle");
            setCurrentGenSlideId(null);
            abortGenRef.current = null;

            // The review pass revises slides after they first report READY, so
            // the finished deck is read once more here.
            void loadSlideHtml(lessonId);

            const { readySlides, errorSlides, totalSlides, quiz, video } = progress;
            if (errorSlides > 0) {
              toast.warning(
                `${readySlides} of ${totalSlides} slides generated. ${errorSlides} failed.`,
              );
            } else if (quiz?.status === "ERROR") {
              toast.warning(
                `All ${readySlides} slides generated, but the quiz could not be built. You can retry it from the preview.`,
              );
            } else if (video?.status === "ERROR") {
              toast.warning(
                `All ${readySlides} slides and the quiz are ready, but narration failed. You can retry the video from the preview.`,
              );
            } else {
              toast.success(
                `All ${readySlides} slides generated` +
                  (quiz?.questionCount ? `, with a ${quiz.questionCount}-question quiz` : "") +
                  (video?.status === "READY" ? " and narrated video." : "."),
              );
            }

            setOutlineLessons((prev) =>
              prev.map((ol) =>
                ol.id === lessonId ? { ...ol, allReady: readySlides === totalSlides } : ol,
              ),
            );
          }
        } catch (pollErr) {
          consecutiveFailures++;
          console.error(
            `[generate-slides] Poll error (${consecutiveFailures}/${MAX_POLL_FAILURES}):`,
            pollErr,
          );
          if (consecutiveFailures >= MAX_POLL_FAILURES) {
            stop();
            setGeneratingLessonId(null);
            setGenStage("idle");
            setCurrentGenSlideId(null);
            toast.warning(
              "Lost track of this lesson's progress. Generation continues on the server — reload the page to pick it up again.",
            );
          }
        }
      };

      pollInterval = setInterval(poll, POLL_INTERVAL_MS);
      // And once straight away: the first slide of a short deck can be ready
      // before the first interval elapses.
      void poll();

      pollControlRef.current = { stop };
      abortGenRef.current = {
        abort: () => {
          stop();
          setGeneratingLessonId(null);
          setGenStage("idle");
          setCurrentGenSlideId(null);
        },
      } as unknown as AbortController;
    },
    [loadSlideHtml],
  );

  // Stop watching when the page goes away.
  useEffect(() => () => pollControlRef.current?.stop(), []);

  // ---- Pick a reopened course's generation back up ----
  //
  // Generation runs on the server and outlives the page, so leaving Create
  // Course — to preview a lesson, say — and coming back used to show a lesson
  // frozen at whatever it had reached, with nothing saying more was on its way.
  useEffect(() => {
    if (!loadedLessons) return;
    let cancelled = false;

    (async () => {
      for (const lesson of loadedLessons.lessons) {
        if (cancelled) return;
        try {
          const res = await fetch(`/api/lessons/${lesson.id}/progress`);
          if (!res.ok) continue;
          const json = await res.json();
          if (cancelled) return;
          if (!json.success) continue;
          const progress = json.data as LessonProgress;
          if (progress.done || progress.totalSlides === 0) continue;
          // A lesson whose slides are all still outlines has not been started;
          // watching it would report progress nobody asked for.
          if (progress.readySlides === 0 && !progress.generatingSlideId) continue;

          setGeneratingLessonId(lesson.id);
          setExpandedOutlineLessonId(lesson.id);
          // Picked up mid-run, so the rate can only be measured from here.
          genStartedAtRef.current = Date.now();
          startProgressPolling(lesson.id);
          return;
        } catch {
          // A lesson whose progress cannot be read is simply left alone.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadedLessons, startProgressPolling]);

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
      slideGenStatesRef.current = initialStates;
      setGeneratingLessonId(lessonId);
      setGenStage("slides");
      setCurrentGenSlideId(null);
      setGenProgress({ current: 0, total: lesson.slides.length });
      setEtaSeconds(null);
      genStartedAtRef.current = Date.now();
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

        startProgressPolling(lessonId);
      } catch {
        toast.error("Failed to generate slides. Please try again.");
        setGeneratingLessonId(null);
        setGenStage("idle");
        setCurrentGenSlideId(null);
        abortGenRef.current = null;
      }
    },
    [outlineLessons, startProgressPolling],
  );

  const handleCancelGeneration = () => {
    abortGenRef.current?.abort();
    pollControlRef.current?.stop();
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
    outlineQuestionCount,
    setOutlineQuestionCount,
    outlineLanguage,
    setOutlineLanguage,
    outlineGenerating,
    editingOutlineLesson,
    setEditingOutlineLesson,
    outlineEditingSlides,
    setOutlineEditingSlides,
    // slide count recommendation
    slideCountSuggestion,
    handleAcceptRecommendedSlides,
    handleDeclineSuggestion,
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
    slidesLoading,
    etaSeconds,
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
