"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Trash2,
  FileText,
  Loader2,
  ImageIcon,
  X,
  Sparkles,
  Eye,
  Wand2,
  LayoutList,
  Minus,
  Plus,
  Pencil,
  RotateCcw,
  Play,
  Check,
  AlertCircle,
  Upload,
  Paperclip,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useUserStore, useCourseStore } from "@/stores/lms-store";
import { useRouter, useSearchParams } from "next/navigation";
import { lessonPreviewPath, ROUTES } from "@/lib/routes";
import { useNavigation } from "@/hooks/use-navigation";
import type { CategoryItem } from "@/types/lms";
import { toast } from "sonner";
import {
  SLIDE_STYLES,
  DEFAULT_STYLE,
  MIN_SLIDES,
  MAX_SLIDES,
  DEFAULT_SLIDE_COUNT,
} from "@/lib/slide-styles";
import {
  OutlineLessonCard,
  OutlineLessonCardProps,
  OutlineLessonDraft,
  OutlineSlideDraft,
  SlideGenState,
} from "@/components/lms/create-course/outline-lesson-card";
import { useCourseUploads } from "@/hooks/use-course-uploads";

// ============================================
// Types
// ============================================

/** Slide in an editable outline */
const MAX_LESSONS = 10;
const MAX_TITLE_LENGTH = 100;
const MAX_DESC_LENGTH = 3000;
const MAX_COURSE_DESC_LENGTH = 500;

// ============================================
// Create Course Page Component
// ============================================

/** A section as returned by the outline endpoint. */
interface OutlineSectionResponse {
  id: string;
  title: string;
  summary: string;
  subtopics: string[];
  slideBudget: number;
  order: number;
}

/** Build the reviewable draft from a phase-one response. */
function toLessonDraft(
  lessonData: {
    id: string;
    title: string;
    subtitle?: string;
    slides: { id: string; title: string; order: number }[];
    sections?: OutlineSectionResponse[];
    requestedSlideCount?: number;
    adjustments?: string[];
  },
  meta: { language: string; style: string; topic: string },
): { lesson: OutlineLessonDraft; slides: OutlineSlideDraft[] } {
  const sections = lessonData.sections ?? [];
  const byId = new Map(sections.map((sec) => [sec.id, sec]));

  const slides: OutlineSlideDraft[] = lessonData.slides.map((s, i) => ({
    id: `local_${Date.now()}_${i}`,
    slideId: s.id,
    title: s.title,
    // The outline a slide answers to is now its section's summary.
    outline:
      byId.get((s as { sectionId?: string }).sectionId ?? "")?.summary ??
      sections[0]?.summary ??
      "",
    order: s.order,
  }));

  return {
    lesson: {
      id: lessonData.id,
      title: lessonData.title,
      subtitle: lessonData.subtitle,
      slides,
      sections: sections.map((sec) => ({
        id: sec.id,
        title: sec.title,
        summary: sec.summary,
        subtopics: sec.subtopics ?? [],
        slideBudget: sec.slideBudget,
        order: sec.order,
      })),
      requestedSlideCount: lessonData.requestedSlideCount,
      adjustments: lessonData.adjustments,
      language: meta.language,
      style: meta.style,
      topic: meta.topic,
    },
    slides,
  };
}

export function CreateCoursePage() {
  const {
    coverImage,
    setCoverImage,
    coverPreview,
    setCoverPreview,
    coverUploading,
    docUploading,
    referenceFiles,
    setReferenceFiles,
    fileInputRef,
    docInputRef,
    handleCoverUpload,
    handleCoverFileChange,
    handleDocUploadClick,
    handleDocFileChange,
    handleRemoveDoc,
    handleRemoveCover,
  } = useCourseUploads();

  const { goBack } = useNavigation();
  const { currentUserId } = useUserStore();
  const { createPrompt, setCreatePrompt } = useCourseStore();

  // ---- Course form state ----
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [language, setLanguage] = useState("english");
  const router = useRouter();

  // The draft's id lives in the URL.
  //
  // It used to live only in component state, so leaving the page for the
  // lesson preview unmounted the component and destroyed it — coming back gave
  // an empty Create Course form even though the course was saved. A query
  // parameter survives navigation, refresh and the browser's back button.
  const searchParams = useSearchParams();
  const courseId = searchParams.get("courseId");

  /** Record the draft in the URL, replacing rather than pushing so Back still
   *  leaves the create page rather than stepping through its own saves. */
  const setCourseId = useCallback(
    (id: string | null) => {
      if (!id || id === courseId) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("courseId", id);
      router.replace(`${ROUTES["create-course"]}?${next.toString()}`);
    },
    [courseId, searchParams, router],
  );

  // ---- UI state ----
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // ---- Reference documents state ----

  // ---- Outline modal state ----
  const [outlineTopic, setOutlineTopic] = useState("");
  const [outlineSlideCount, setOutlineSlideCount] = useState(DEFAULT_SLIDE_COUNT);
  const [outlineStyle, setOutlineStyle] = useState(DEFAULT_STYLE);
  const [outlineLanguage, setOutlineLanguage] = useState(language);
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [editingOutlineLesson, setEditingOutlineLesson] = useState<string | null>(null);
  const [outlineEditingSlides, setOutlineEditingSlides] = useState<OutlineSlideDraft[]>([]);

  // ---- Lessons list ----
  const [outlineLessons, setOutlineLessons] = useState<OutlineLessonDraft[]>([]);
  const [expandedOutlineLessonId, setExpandedOutlineLessonId] = useState<string | null>(null);

  // ---- Slide generation state ----
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

  // ---- Load existing course when editing from dashboard ----
  const { editingCourseId, setEditingCourseId } = useCourseStore();
  useEffect(() => {
    if (editingCourseId && !courseId) {
      setCourseId(editingCourseId);
      setEditingCourseId(null);
    }
  }, [editingCourseId, courseId, setEditingCourseId, setCourseId]);

  // ---- Refs ----

  // ---- Pre-fill title from hero prompt ----
  useEffect(() => {
    if (createPrompt) {
      setTitle(createPrompt);
      setCreatePrompt("");
    }
  }, [createPrompt, setCreatePrompt]);

  // ---- Fetch categories ----
  useEffect(() => {
    async function fetchCategories() {
      setLoading(true);
      try {
        const res = await fetch("/api/categories");
        const json = await res.json();
        if (json.success) {
          setCategories(json.data);
        }
      } catch {
        toast.error("Failed to load categories");
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, []);

  // ---- Load existing course data when editing ----
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}?userId=${currentUserId}`);
        const json = await res.json();
        if (!json.success || cancelled) return;
        const c = json.data;
        if (c.title) setTitle(c.title);
        if (c.description) setDescription(c.description);
        if (c.categoryId) setCategoryId(c.categoryId);
        if (c.language) setLanguage(c.language);
        if (c.coverImage) setCoverImage(c.coverImage);

        // Load lessons with their sections and slides
        if (c.lessons && c.lessons.length > 0) {
          const restoredStates: Record<string, SlideGenState> = {};

          const lessonDrafts: OutlineLessonDraft[] = c.lessons.map(
            (lesson: {
              id: string;
              title: string;
              outlineJson: string | null;
              sections?: OutlineSectionResponse[];
              slides?: {
                id: string;
                title: string;
                htmlBody: string;
                status: string;
                order: number;
                sectionId: string | null;
              }[];
            }) => {
              const parsedOutline = lesson.outlineJson ? JSON.parse(lesson.outlineJson) : null;
              const lessonSlides = lesson.slides ?? [];

              // Rebuild the preview map from stored HTML. It is only filled in
              // during generation, so reopening a draft course previously left
              // it empty and the preview button showed nothing.
              for (const slide of lessonSlides) {
                if (slide.status === "READY" && slide.htmlBody) {
                  restoredStates[slide.id] = { status: "complete", htmlBody: slide.htmlBody };
                } else if (slide.status === "ERROR") {
                  restoredStates[slide.id] = { status: "error", error: "Generation failed" };
                }
              }

              const { lesson: draft } = toLessonDraft(
                {
                  id: lesson.id,
                  title: lesson.title,
                  slides: lessonSlides,
                  sections: lesson.sections,
                  requestedSlideCount: parsedOutline?.slideCount,
                  adjustments: parsedOutline?.adjustments,
                },
                {
                  language: c.language || "english",
                  style: parsedOutline?.style || DEFAULT_STYLE,
                  topic: parsedOutline?.topic || lesson.title,
                },
              );

              return {
                ...draft,
                allReady:
                  lessonSlides.length > 0 && lessonSlides.every((s) => s.status === "READY"),
              };
            },
          );

          setOutlineLessons(lessonDrafts);
          setSlideGenStates(restoredStates);
          if (lessonDrafts.length > 0) setExpandedOutlineLessonId(lessonDrafts[0].id);
        }
      } catch {
        toast.error("Failed to load course data");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, currentUserId]);

  // ---- Cover image handlers (local file upload) ----
  // ---- Auto-save course as draft (needed before outline generation) ----
  const ensureCourseSaved = useCallback(async (): Promise<string | null> => {
    if (courseId) return courseId;
    if (!title.trim() || !currentUserId) {
      toast.error("Please enter a course title first");
      return null;
    }
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          categoryId: categoryId || null,
          language,
          creatorId: currentUserId,
          coverImage: coverImage || null,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        setCourseId(json.data.id);
        return json.data.id;
      }
      toast.error("Failed to save course draft");
      return null;
    } catch {
      toast.error("Failed to save course draft");
      return null;
    }
  }, [courseId, title, description, categoryId, language, currentUserId, coverImage]);

  // ---- Open modal for new outline ----
  const handleOpenModal = () => {
    setOutlineTopic("");
    setOutlineSlideCount(DEFAULT_SLIDE_COUNT);
    setOutlineStyle(DEFAULT_STYLE);
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
          style: outlineStyle,
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
        style: outlineStyle,
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
    outlineStyle,
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
          style: outlineStyle,
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
        style: outlineStyle,
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

  // ---- Form submission ----
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Course title is required");
      return;
    }

    // Check if any lesson is still generating
    if (generatingLessonId) {
      toast.error("Please wait for slide generation to finish");
      return;
    }

    setSaving(true);
    try {
      if (courseId) {
        // Update existing course to published
        const res = await fetch(`/api/courses/${courseId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            categoryId: categoryId || null,
            language,
            coverImage: coverImage || null,
            status: "published",
          }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success("Course published successfully!");
          goBack();
        } else {
          toast.error(json.error || "Failed to publish course");
        }
      } else {
        toast.error("Please add at least one lesson first");
      }
    } catch {
      toast.error("Failed to save course. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ============================================
  // Render
  // ============================================

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* ---- Breadcrumbs ---- */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={goBack}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-foreground text-lg font-semibold">Create Course</h1>
      </div>

      {/* ---- Two-Column Layout ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ======== Left Panel: Course Metadata (3 cols) ======== */}
        <div className="lg:col-span-3">
          <Card className="border-border/50">
            <CardContent className="space-y-6 p-6">
              {/* Cover Image Upload */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Cover Image</Label>
                {coverPreview ? (
                  <div className="border-border relative overflow-hidden rounded-lg border">
                    <img
                      src={coverPreview}
                      alt="Course cover"
                      className="h-48 w-full object-cover"
                      onError={() => setCoverPreview(null)}
                    />
                    <button
                      onClick={handleRemoveCover}
                      className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCoverUpload}
                    disabled={coverUploading}
                    className="border-border/70 bg-muted/30 hover:border-primary/50 hover:bg-muted/50 flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors disabled:opacity-50"
                  >
                    {coverUploading ? (
                      <Loader2 className="text-primary h-5 w-5 animate-spin" />
                    ) : (
                      <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                        <Upload className="text-muted-foreground h-5 w-5" />
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-foreground text-sm font-medium">
                        {coverUploading ? "Uploading..." : "Upload cover image"}
                      </p>
                      <p className="text-muted-foreground mt-0.5 text-xs">Recommended 1920×1080</p>
                    </div>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                  className="hidden"
                  onChange={handleCoverFileChange}
                />
              </div>

              <Separator />

              {/* Course Title */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="course-title" className="text-sm font-medium">
                    Course Title <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-muted-foreground text-xs">
                    {title.length}/{MAX_TITLE_LENGTH}
                  </span>
                </div>
                <Input
                  id="course-title"
                  placeholder="Enter course title"
                  value={title}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_TITLE_LENGTH) {
                      setTitle(e.target.value);
                    }
                  }}
                  className="h-10"
                />
              </div>

              {/* Course Description */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="course-description" className="text-sm font-medium">
                    Description
                  </Label>
                  <span className="text-muted-foreground text-xs">
                    {description.length}/{MAX_COURSE_DESC_LENGTH}
                  </span>
                </div>
                <Textarea
                  id="course-description"
                  placeholder="Describe what this course is about..."
                  value={description}
                  onChange={(e) => {
                    if (e.target.value.length <= MAX_COURSE_DESC_LENGTH) {
                      setDescription(e.target.value);
                    }
                  }}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <Separator />

              {/* Category */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Language */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Language</Label>
                <RadioGroup value={language} onValueChange={setLanguage} className="flex gap-6">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="chinese" id="lang-zh" />
                    <Label htmlFor="lang-zh" className="cursor-pointer text-sm font-normal">
                      Chinese
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="english" id="lang-en" />
                    <Label htmlFor="lang-en" className="cursor-pointer text-sm font-normal">
                      English
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Separator />

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim() || outlineLessons.length === 0}
                className="h-10 w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Publish Course"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ======== Right Panel: Lessons (2 cols) ======== */}
        <div className="lg:col-span-2">
          <Card className="border-border/50">
            <CardContent className="p-6">
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-foreground text-base font-semibold">Lessons</h2>
                  <Badge variant="secondary" className="text-xs font-normal">
                    {outlineLessons.length}/{MAX_LESSONS}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  onClick={handleOpenModal}
                  disabled={outlineLessons.length >= MAX_LESSONS || !!generatingLessonId}
                  className="gap-1.5"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Generate Lesson with AI</span>
                  <span className="sm:hidden">AI Generate</span>
                </Button>
              </div>

              {outlineLessons.length === 0 ? (
                <div className="border-border/70 bg-muted/20 flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                  <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                    <FileText className="text-muted-foreground h-5 w-5" />
                  </div>
                  <p className="text-muted-foreground mt-3 text-sm">No lessons yet</p>
                  <p className="text-muted-foreground/70 mt-1 text-xs">
                    Click <span className="text-primary font-medium">Generate Lesson with AI</span>{" "}
                    to create your first lesson.
                  </p>
                </div>
              ) : (
                <div className="max-h-[600px] space-y-2 overflow-y-auto pr-1">
                  {outlineLessons.map((ol, index) => (
                    <OutlineLessonCard
                      key={ol.id}
                      lesson={ol}
                      index={index}
                      expanded={expandedOutlineLessonId === ol.id}
                      isGenerating={generatingLessonId === ol.id}
                      slideGenStates={slideGenStates}
                      currentGenSlideId={currentGenSlideId}
                      genProgress={genProgress}
                      genStage={ol.id === generatingLessonId ? genStage : "idle"}
                      onToggleExpand={() =>
                        setExpandedOutlineLessonId((prev) => (prev === ol.id ? null : ol.id))
                      }
                      onEditOutline={() => {
                        setEditingOutlineLesson(ol.id);
                        setOutlineEditingSlides(ol.slides);
                        setOutlineTopic(ol.topic);
                        setOutlineSlideCount(ol.slides.length);
                        setOutlineStyle(ol.style);
                        setModalOpen(true);
                      }}
                      onUpdateSlideTitle={(slideId, newTitle) =>
                        handleUpdateSlideTitle(slideId, newTitle)
                      }
                      onDeleteSlide={(slideId, localId) =>
                        handleDeleteOutlineSlide(slideId, localId)
                      }
                      onGenerateSlides={() => handleGenerateSlides(ol.id)}
                      onCancelGeneration={handleCancelGeneration}
                      onDelete={() => handleDeleteOutlineLesson(ol.id)}
                      onPreview={() => router.push(lessonPreviewPath(ol.id))}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ======== Generate Lesson Modal (Unified Outline Flow) ======== */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && outlineGenerating) return;
          setModalOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="text-primary h-5 w-5" />
              Generate Lesson with AI
            </DialogTitle>
            <DialogDescription className="sr-only">
              Generate a slide outline for your lesson using AI
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Topic */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Prompt <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g., Create a lesson about data science fundamentals for beginners, covering key concepts like supervised vs unsupervised learning, with real-world examples"
                value={outlineTopic}
                onChange={(e) => setOutlineTopic(e.target.value)}
                className="h-10"
                disabled={outlineGenerating}
              />
            </div>

            {/* Slide Count + Style row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Slide Count */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Slide Count</Label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOutlineSlideCount((p) => Math.max(MIN_SLIDES, p - 1))}
                    disabled={outlineGenerating || outlineSlideCount <= MIN_SLIDES}
                    className="border-border text-muted-foreground hover:bg-muted flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <Input
                    type="number"
                    min={MIN_SLIDES}
                    max={MAX_SLIDES}
                    value={outlineSlideCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v))
                        setOutlineSlideCount(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, v)));
                    }}
                    className="h-9 w-16 text-center"
                    disabled={outlineGenerating}
                  />
                  <button
                    onClick={() => setOutlineSlideCount((p) => Math.min(MAX_SLIDES, p + 1))}
                    disabled={outlineGenerating || outlineSlideCount >= MAX_SLIDES}
                    className="border-border text-muted-foreground hover:bg-muted flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Template — drives the deck, the preview and the learn view alike */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Template</Label>
                <Select
                  value={outlineStyle}
                  onValueChange={setOutlineStyle}
                  disabled={outlineGenerating}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SLIDE_STYLES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex items-center gap-2">
                          <span>{s.label}</span>
                          <span className="text-muted-foreground text-xs">{s.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Language + Reference Docs row */}
            <div className="grid grid-cols-2 gap-4">
              {/* Language */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" />
                    Language
                  </span>
                </Label>
                <Select
                  value={outlineLanguage}
                  onValueChange={setOutlineLanguage}
                  disabled={outlineGenerating}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="english">English</SelectItem>
                    <SelectItem value="chinese">中文 (Chinese)</SelectItem>
                    <SelectItem value="spanish">Español (Spanish)</SelectItem>
                    <SelectItem value="french">Français (French)</SelectItem>
                    <SelectItem value="german">Deutsch (German)</SelectItem>
                    <SelectItem value="japanese">日本語 (Japanese)</SelectItem>
                    <SelectItem value="korean">한국어 (Korean)</SelectItem>
                    <SelectItem value="indonesian">Bahasa Indonesia</SelectItem>
                    <SelectItem value="malay">Bahasa Melayu</SelectItem>
                    <SelectItem value="portuguese">Português (Portuguese)</SelectItem>
                    <SelectItem value="arabic">العربية (Arabic)</SelectItem>
                    <SelectItem value="thai">ไทย (Thai)</SelectItem>
                    <SelectItem value="vietnamese">Tiếng Việt (Vietnamese)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reference Documents */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5" />
                    Reference Documents
                  </span>
                  <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                    (optional)
                  </span>
                </Label>
                <input
                  ref={docInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.csv,.xls,.xlsx,.md,.rtf"
                  className="hidden"
                  onChange={handleDocFileChange}
                />
                <button
                  type="button"
                  onClick={handleDocUploadClick}
                  disabled={outlineGenerating || docUploading}
                  className="border-border/70 bg-muted/30 text-muted-foreground hover:border-primary/50 hover:bg-muted/50 hover:text-foreground flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed text-sm transition-colors disabled:opacity-50"
                >
                  {docUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {docUploading ? "Uploading..." : "Upload Documents"}
                </button>
                <p className="text-muted-foreground text-[10px]">
                  PDF, DOCX, PPTX, TXT, CSV, XLSX, MD, RTF
                </p>
              </div>
            </div>

            {/* Uploaded reference files list */}
            {referenceFiles.length > 0 && (
              <div className="space-y-1.5">
                {referenceFiles.map((f) => (
                  <div
                    key={f.url}
                    className="border-border/50 bg-muted/20 flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <FileText className="text-muted-foreground h-4 w-4 shrink-0" />
                    <span className="text-foreground flex-1 truncate text-xs">{f.name}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      onClick={() => handleRemoveDoc(f.url)}
                      disabled={outlineGenerating}
                      className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-5 w-5 items-center justify-center rounded transition-colors disabled:opacity-40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* ---- Loading state ---- */}
            {outlineGenerating && (
              <div className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="text-primary h-8 w-8 animate-spin" />
                <p className="text-muted-foreground text-sm">Generating slide outline...</p>
              </div>
            )}

            {/* ---- Editable Outline List ---- */}
            {!outlineGenerating && editingOutlineLesson && outlineEditingSlides.length > 0 && (
              <div className="space-y-3">
                {/* Editable Lesson Title */}
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground text-xs font-medium">Lesson Title</Label>
                  <Input
                    value={outlineLessons.find((ol) => ol.id === editingOutlineLesson)?.title || ""}
                    onChange={(e) => {
                      const newTitle = e.target.value;
                      setOutlineLessons((prev) =>
                        prev.map((ol) =>
                          ol.id === editingOutlineLesson ? { ...ol, title: newTitle } : ol,
                        ),
                      );
                    }}
                    onBlur={() => {
                      const lesson = outlineLessons.find((ol) => ol.id === editingOutlineLesson);
                      if (lesson && editingOutlineLesson) {
                        handleUpdateLessonTitle(editingOutlineLesson, lesson.title);
                      }
                    }}
                    className="h-9 text-sm"
                    placeholder="Lesson title..."
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-foreground text-sm font-semibold">
                      Slide Outline ({outlineEditingSlides.length} slides)
                    </Label>
                    <Badge variant="secondary" className="text-[10px]">
                      {outlineStyle}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleAddOutlineSlide}
                      className="h-7 gap-1 text-xs"
                    >
                      <Plus className="h-3 w-3" />
                      Add Slide
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRegenerateOutline}
                      className="h-7 gap-1 text-xs"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>
                </div>

                <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
                  {outlineEditingSlides.map((slide, i) => (
                    <div
                      key={slide.id}
                      className="group border-border/50 bg-card hover:border-primary/30 flex items-start gap-3 rounded-lg border p-3 transition-colors"
                    >
                      <div className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input
                          value={slide.title}
                          onChange={(e) => {
                            const newTitle = e.target.value;
                            setOutlineEditingSlides((prev) =>
                              prev.map((s) => (s.id === slide.id ? { ...s, title: newTitle } : s)),
                            );
                          }}
                          onBlur={() => {
                            if (slide.slideId) handleUpdateSlideTitle(slide.slideId, slide.title);
                          }}
                          className="text-foreground placeholder:text-muted-foreground/50 focus:border-primary/30 w-full border-b border-transparent bg-transparent text-sm font-medium transition-colors outline-none"
                          placeholder="Slide title..."
                        />
                        <textarea
                          value={slide.outline}
                          onChange={(e) => {
                            const newOutline = e.target.value;
                            setOutlineEditingSlides((prev) =>
                              prev.map((s) =>
                                s.id === slide.id ? { ...s, outline: newOutline } : s,
                              ),
                            );
                          }}
                          rows={2}
                          className="text-muted-foreground placeholder:text-muted-foreground/50 focus:border-primary/30 w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-xs leading-relaxed transition-colors outline-none"
                          placeholder="Slide description..."
                        />
                      </div>
                      <button
                        onClick={() => handleDeleteOutlineSlide(slide.slideId || "", slide.id)}
                        className="text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-0 transition-all group-hover:opacity-100"
                        aria-label="Remove slide"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <DialogFooter className="mt-2">
                  <Button variant="ghost" onClick={() => setModalOpen(false)}>
                    Close
                  </Button>
                  <Button
                    onClick={() => {
                      if (editingOutlineLesson) handleGenerateSlides(editingOutlineLesson);
                    }}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Generate Slides
                  </Button>
                </DialogFooter>
              </div>
            )}

            {/* ---- Generate button (no outline yet) ---- */}
            {!outlineGenerating && (!editingOutlineLesson || outlineEditingSlides.length === 0) && (
              <DialogFooter className="mt-2">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateOutline}
                  disabled={!outlineTopic.trim()}
                  className="gap-2"
                >
                  <Wand2 className="h-4 w-4" />
                  Generate Outline
                </Button>
              </DialogFooter>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Outline Lesson Card
// ============================================
