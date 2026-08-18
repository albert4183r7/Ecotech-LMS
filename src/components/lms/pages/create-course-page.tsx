"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  GripVertical,
  ChevronUp,
  ChevronDown,
  Loader2,
  ImageIcon,
  X,
  FileUp,
  Sparkles,
  Eye,
  Wand2,
  LayoutList,
  Minus,
  Pencil,
  RotateCcw,
  Play,
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
import { useNavigationStore, useUserStore, useCourseStore } from "@/stores/lms-store";
import type { CategoryItem } from "@/types/lms";
import { toast } from "sonner";
import { SLIDE_STYLES, MIN_SLIDES, MAX_SLIDES, DEFAULT_SLIDE_COUNT } from "@/lib/slide-styles";

// ============================================
// Types
// ============================================

interface LessonDraft {
  id: string;
  title: string;
  totalPages: number;
  htmlBody: string;
  language: string;
}

/** Slide in an editable outline */
interface OutlineSlideDraft {
  id: string;
  slideId: string | null; // DB slide ID if persisted
  title: string;
  outline: string;
  order: number;
}

/** A lesson created via the outline flow (persisted in DB) */
interface OutlineLessonDraft {
  id: string; // DB lesson ID
  title: string;
  slides: OutlineSlideDraft[];
  language: string;
  style: string;
  topic: string;
}

// ============================================
// Create Course Page Component
// ============================================

const MAX_LESSONS = 10;
const MAX_TITLE_LENGTH = 100;
const MAX_DESC_LENGTH = 3000;
const MAX_COURSE_DESC_LENGTH = 500;

export function CreateCoursePage() {
  const { goBack } = useNavigationStore();
  const { currentUserId } = useUserStore();
  const { createPrompt, setCreatePrompt } = useCourseStore();

  // ---- Form state ----
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [language, setLanguage] = useState("english");
  const [coverImage, setCoverImage] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [lessons, setLessons] = useState<LessonDraft[]>([]);
  const [courseId, setCourseId] = useState<string | null>(null);

  // ---- UI state ----
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  // ---- Modal state (Quick Generate) ----
  const [lessonName, setLessonName] = useState("");
  const [lessonPrompt, setLessonPrompt] = useState("");
  const [lessonLanguage, setLessonLanguage] = useState("english");
  const [lessonPdfName, setLessonPdfName] = useState("");

  // ---- Outline mode state ----
  const [generateMode, setGenerateMode] = useState<"quick" | "outline">("outline");
  const [outlineTopic, setOutlineTopic] = useState("");
  const [outlineSlideCount, setOutlineSlideCount] = useState(DEFAULT_SLIDE_COUNT);
  const [outlineStyle, setOutlineStyle] = useState("professional");
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [outlineLessons, setOutlineLessons] = useState<OutlineLessonDraft[]>([]);
  const [editingOutlineLesson, setEditingOutlineLesson] = useState<string | null>(null);
  const [outlineEditingSlides, setOutlineEditingSlides] = useState<OutlineSlideDraft[]>([]);

  // ---- Live streaming state ----
  const [streamingHtml, setStreamingHtml] = useState("");
  const [showStreamPreview, setShowStreamPreview] = useState(false);
   const streamPreviewRef = useRef<HTMLDivElement>(null);

  // ---- Expanded lesson preview (quick lessons) ----
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  // ---- Expanded outline preview ----
  const [expandedOutlineLessonId, setExpandedOutlineLessonId] = useState<string | null>(null);

  // ---- Pre-fill title from hero prompt ----
  useEffect(() => {
    if (createPrompt) {
      setTitle(createPrompt);
      setCreatePrompt("");
    }
  }, [createPrompt, setCreatePrompt]);

  // ---- Refs ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lessonFileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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

  // ---- Cover image handlers ----
  const handleCoverUpload = () => {
    setUrlInputOpen(true);
  };

  const handleUrlConfirm = () => {
    if (imageUrl.trim()) {
      setCoverImage(imageUrl.trim());
      setCoverPreview(imageUrl.trim());
      setUrlInputOpen(false);
      setImageUrl("");
    }
  };

  const handleRemoveCover = () => {
    setCoverImage("");
    setCoverPreview(null);
  };

  // ---- Lesson management ----
  const handleOpenModal = () => {
    setLessonName("");
    setLessonPrompt("");
    setLessonLanguage(language);
    setLessonPdfName("");
    setStreamingHtml("");
    setShowStreamPreview(false);
    setGenerateMode("quick");
    setModalOpen(true);
  };

  const handleGenerateLesson = useCallback(async () => {
    if (!lessonName.trim()) {
      toast.error("Lesson name is required");
      return;
    }
    if (!lessonPrompt.trim()) {
      toast.error("Content prompt is required");
      return;
    }
    if (lessons.length >= MAX_LESSONS) {
      toast.error(`Maximum ${MAX_LESSONS} lessons allowed`);
      return;
    }

    setGenerating(true);
    setStreamingHtml("");
    setShowStreamPreview(true);

    const abort = new AbortController();
    abortControllerRef.current = abort;

    try {
      const res = await fetch("/api/generate-slide-html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideTitle: lessonName.trim(),
          prompt: lessonPrompt.trim(),
          language: lessonLanguage,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        toast.error("Failed to start generation");
        setGenerating(false);
        setShowStreamPreview(false);
        return;
      }

      // Read SSE stream with live preview
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let htmlBody = "";
      let slideTitle = lessonName.trim();
      let rawHtml = ""; // accumulating raw HTML fragments for live preview

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.htmlBody) {
              htmlBody = data.htmlBody;
            }
            if (data.slideTitle) {
              slideTitle = data.slideTitle;
            }
            if (data.html) {
              rawHtml += data.html;
              // Build live preview from accumulated raw HTML
              const previewDoc = buildLivePreviewDoc(rawHtml, slideTitle);
              setStreamingHtml(previewDoc);
              // Auto-scroll preview into view
              streamPreviewRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
          } catch {
            // skip malformed JSON
          }
        }
      }

      if (!htmlBody) {
        toast.error("Generation returned empty content");
        setGenerating(false);
        setShowStreamPreview(false);
        return;
      }

      const newLesson: LessonDraft = {
        id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: slideTitle,
        totalPages: 1,
        htmlBody,
        language: lessonLanguage,
      };

      setLessons((prev) => [...prev, newLesson]);
      setModalOpen(false);
      setShowStreamPreview(false);
      setStreamingHtml("");
      toast.success(`Lesson \"${slideTitle}\" generated successfully`);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Failed to generate lesson. Please try again.");
    } finally {
      setGenerating(false);
      abortControllerRef.current = null;
    }
  }, [lessonName, lessonPrompt, lessonLanguage, lessons.length]);

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
    setGenerating(false);
    setShowStreamPreview(false);
    setStreamingHtml("");
  };

  // ---- Auto-save course as draft (needed for outline mode) ----
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

  // ---- Outline generation ----
  const handleOpenOutlineModal = () => {
    setOutlineTopic("");
    setOutlineSlideCount(DEFAULT_SLIDE_COUNT);
    setOutlineStyle("professional");
    setOutlineGenerating(false);
    setEditingOutlineLesson(null);
    setOutlineEditingSlides([]);
    setGenerateMode("outline");
    setModalOpen(true);
  };

  const handleGenerateOutline = useCallback(async () => {
    if (!outlineTopic.trim()) {
      toast.error("Topic is required");
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
          language,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        toast.error(json.error || "Failed to generate outline");
        setOutlineGenerating(false);
        return;
      }

      const lessonData = json.data;
      const parsedOutline = JSON.parse(lessonData.outlineJson || "{}");
      const slides: OutlineSlideDraft[] = lessonData.slides.map(
        (s: { id: string; title: string; order: number }, i: number) => ({
          id: `local_${Date.now()}_${i}`,
          slideId: s.id,
          title: s.title,
          outline: parsedOutline.slides?.[i]?.outline || "",
          order: s.order,
        })
      );

      const newOutlineLesson: OutlineLessonDraft = {
        id: lessonData.id,
        title: lessonData.title,
        slides,
        language,
        style: outlineStyle,
        topic: outlineTopic.trim(),
      };

      setOutlineLessons((prev) => [...prev, newOutlineLesson]);
      setEditingOutlineLesson(lessonData.id);
      setOutlineEditingSlides(slides);
      setOutlineGenerating(false);
      toast.success(`Outline generated: ${slides.length} slides`);
    } catch {
      toast.error("Failed to generate outline. Please try again.");
      setOutlineGenerating(false);
    }
  }, [outlineTopic, outlineSlideCount, outlineStyle, language, ensureCourseSaved]);

  const handleUpdateSlideTitle = async (slideId: string, newTitle: string) => {
    setOutlineEditingSlides((prev) =>
      prev.map((s) => (s.slideId === slideId ? { ...s, title: newTitle } : s))
    );
    setOutlineLessons((prev) =>
      prev.map((ol) =>
        ol.id === editingOutlineLesson
          ? {
              ...ol,
              slides: ol.slides.map((s) =>
                s.slideId === slideId ? { ...s, title: newTitle } : s
              ),
            }
          : ol
      )
    );
    // Persist to DB
    try {
      await fetch(`/api/slides/${slideId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    } catch {
      // silent — will sync on next load
    }
  };

  const handleDeleteOutlineSlide = async (slideId: string, localId: string) => {
    setOutlineEditingSlides((prev) => prev.filter((s) => s.id !== localId));
    setOutlineLessons((prev) =>
      prev.map((ol) =>
        ol.id === editingOutlineLesson
          ? {
              ...ol,
              slides: ol.slides.filter((s) => s.id !== localId),
            }
          : ol
      )
    );
    if (slideId) {
      try {
        await fetch(`/api/slides/${slideId}`, { method: "DELETE" });
      } catch {
        // silent
      }
    }
  };

  const handleAddOutlineSlide = async () => {
    if (!editingOutlineLesson) return;
    try {
      const newOrder = outlineEditingSlides.length;
      const res = await fetch("/api/lessons/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          topic: outlineTopic,
          slideCount: 1,
          style: outlineStyle,
          language,
        }),
      });
      // Simpler: just add a blank slide
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
          ol.id === editingOutlineLesson
            ? { ...ol, slides: [...ol.slides, newSlide] }
            : ol
        )
      );
    } catch {
      // fallback: add local only
      const localId = `local_${Date.now()}_new`;
      const newSlide: OutlineSlideDraft = {
        id: localId,
        slideId: null,
        title: `Slide ${outlineEditingSlides.length + 1}`,
        outline: "",
        order: outlineEditingSlides.length,
      };
      setOutlineEditingSlides((prev) => [...prev, newSlide]);
    }
  };

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
          language,
          existingLessonId: editingOutlineLesson,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error(json.error || "Failed to regenerate");
        setOutlineGenerating(false);
        return;
      }
      const lessonData = json.data;
      const parsedOutline = JSON.parse(lessonData.outlineJson || "{}");
      const slides: OutlineSlideDraft[] = lessonData.slides.map(
        (s: { id: string; title: string; order: number }, i: number) => ({
          id: `local_${Date.now()}_${i}`,
          slideId: s.id,
          title: s.title,
          outline: parsedOutline.slides?.[i]?.outline || "",
          order: s.order,
        })
      );
      setOutlineEditingSlides(slides);
      setOutlineLessons((prev) =>
        prev.map((ol) =>
          ol.id === editingOutlineLesson
            ? { ...ol, title: lessonData.title, slides }
            : ol
        )
      );
      setOutlineGenerating(false);
      toast.success("Outline regenerated");
    } catch {
      toast.error("Failed to regenerate outline");
      setOutlineGenerating(false);
    }
  };

  const handleGenerateSlides = (lessonId: string) => {
    toast.info("Slide HTML generation will be available in the next step.");
  };

  const handleDeleteOutlineLesson = async (lessonId: string) => {
    setOutlineLessons((prev) => prev.filter((ol) => ol.id !== lessonId));
    if (editingOutlineLesson === lessonId) {
      setEditingOutlineLesson(null);
      setOutlineEditingSlides([]);
    }
    // Delete lesson from DB (cascades to slides)
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.success) toast.error("Failed to remove lesson");
    } catch {
      toast.error("Failed to remove lesson");
    }
  };

  const handleDeleteLesson = (id: string) => {
    setLessons((prev) => prev.filter((s) => s.id !== id));
    if (expandedLessonId === id) setExpandedLessonId(null);
  };

  const handleMoveLesson = (index: number, direction: "up" | "down") => {
    const newLessons = [...lessons];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newLessons.length) return;
    [newLessons[index], newLessons[targetIndex]] = [
      newLessons[targetIndex],
      newLessons[index],
    ];
    setLessons(newLessons);
  };

  // ---- Form submission ----
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Course title is required");
      return;
    }

    // Check if any quick-generate lesson is missing htmlBody
    const missingContent = lessons.filter((s) => !s.htmlBody);
    if (missingContent.length > 0) {
      toast.error(`${missingContent.length} lesson(s) have no content yet. Generate content for all lessons first.`);
      return;
    }

    setSaving(true);
    try {
      if (courseId) {
        // Update existing draft course
        // Also create any local quick-generate lessons
        if (lessons.length > 0) {
          for (let i = 0; i < lessons.length; i++) {
            const sec = lessons[i];
            await fetch(`/api/lessons`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                courseId,
                title: sec.title,
                order: outlineLessons.length + i,
                // htmlBody is stored on slides, not lesson directly in new schema
              }),
            });
          }
        }
        // Update course metadata
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
          toast.success("Course updated successfully!");
          goBack();
        } else {
          toast.error(json.error || "Failed to update course");
        }
      } else {
        // Create new course (original flow)
        const payload = {
          title: title.trim(),
          description: description.trim() || null,
          categoryId: categoryId || null,
          language,
          creatorId: currentUserId,
          coverImage: coverImage || null,
          lessons: lessons.map((sec, index) => ({
            title: sec.title,
            htmlBody: sec.htmlBody,
            totalPages: sec.totalPages,
            order: index,
          })),
        };

        const res = await fetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const json = await res.json();

        if (json.success) {
          toast.success("Course created successfully!");
          goBack();
        } else {
          toast.error(json.error || "Failed to create course");
        }
      }
    } catch {
      toast.error("Failed to save course. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ---- Lesson PDF upload simulation ----
  const handleLessonPdfUpload = () => {
    lessonFileInputRef.current?.click();
  };

  const handleLessonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLessonPdfName(file.name);
      if (!lessonPrompt.trim()) {
        const nameWithoutExt = file.name.replace(/\.pdf$/i, "");
        setLessonPrompt(
          `Generate course content based on the uploaded PDF: ${nameWithoutExt}`
        );
        if (!lessonName.trim()) {
          setLessonName(nameWithoutExt);
        }
      }
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
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-lg font-semibold text-foreground">Create Course</h1>
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
                  <div className="relative overflow-hidden rounded-lg border border-border">
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
                    className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border/70 bg-muted/30 transition-colors hover:border-primary/50 hover:bg-muted/50"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        Upload cover image
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Recommended 1920×1080
                      </p>
                    </div>
                  </button>
                )}

                {/* URL Input */}
                {urlInputOpen && (
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Paste image URL here..."
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleUrlConfirm()}
                      className="flex-1"
                    />
                    <Button size="sm" onClick={handleUrlConfirm}>
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setUrlInputOpen(false);
                        setImageUrl("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                />
              </div>

              <Separator />

              {/* Course Title */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="course-title" className="text-sm font-medium">
                    Course Title <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground">
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
                  <Label
                    htmlFor="course-description"
                    className="text-sm font-medium"
                  >
                    Description
                  </Label>
                  <span className="text-xs text-muted-foreground">
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
                  <SelectTrigger className="w-full h-10">
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
                <RadioGroup
                  value={language}
                  onValueChange={setLanguage}
                  className="flex gap-6"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="chinese" id="lang-zh" />
                    <Label
                      htmlFor="lang-zh"
                      className="cursor-pointer text-sm font-normal"
                    >
                      Chinese
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="english" id="lang-en" />
                    <Label
                      htmlFor="lang-en"
                      className="cursor-pointer text-sm font-normal"
                    >
                      English
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <Separator />

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={saving || !title.trim()}
                className="w-full h-10"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Course"
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
                  <h2 className="text-base font-semibold text-foreground">
                    Lessons
                  </h2>
                  <Badge
                    variant="secondary"
                    className="text-xs font-normal"
                  >
                    {lessons.length + outlineLessons.length}/{MAX_LESSONS}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenOutlineModal}
                    disabled={lessons.length + outlineLessons.length >= MAX_LESSONS}
                    className="gap-1.5 text-primary border-primary/40 hover:bg-primary/10"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">AI Outline</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenModal}
                    disabled={lessons.length + outlineLessons.length >= MAX_LESSONS}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              </div>

              {lessons.length === 0 && outlineLessons.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 py-16">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    No lessons yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Use <span className="font-medium text-primary">AI Outline</span> to generate a slide outline, or <span className="font-medium text-foreground">+ Add</span> for quick generation.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {/* Outline lessons */}
                  {outlineLessons.map((ol, index) => (
                    <OutlineLessonCard
                      key={ol.id}
                      lesson={ol}
                      index={index}
                      expanded={expandedOutlineLessonId === ol.id}
                      isEditing={editingOutlineLesson === ol.id}
                      editingSlides={editingOutlineLesson === ol.id ? outlineEditingSlides : []}
                      onToggleExpand={() =>
                        setExpandedOutlineLessonId((prev) =>
                          prev === ol.id ? null : ol.id
                        )
                      }
                      onEditOutline={() => {
                        setEditingOutlineLesson(ol.id);
                        setOutlineEditingSlides(ol.slides);
                        setOutlineTopic(ol.topic);
                        setOutlineSlideCount(ol.slides.length);
                        setOutlineStyle(ol.style);
                        setModalOpen(true);
                        setGenerateMode("outline");
                      }}
                      onUpdateSlideTitle={(slideId, newTitle) => handleUpdateSlideTitle(slideId, newTitle)}
                      onDeleteSlide={(slideId, localId) => handleDeleteOutlineSlide(slideId, localId)}
                      onGenerateSlides={() => handleGenerateSlides(ol.id)}
                      onDelete={() => handleDeleteOutlineLesson(ol.id)}
                    />
                  ))}
                  {/* Quick-generate lessons */}
                  {lessons.map((lesson, index) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      index={outlineLessons.length + index}
                      totalCount={outlineLessons.length + lessons.length}
                      expanded={expandedLessonId === lesson.id}
                      onToggleExpand={() =>
                        setExpandedLessonId((prev) =>
                          prev === lesson.id ? null : lesson.id
                        )
                      }
                      onMoveUp={() => handleMoveLesson(outlineLessons.length + index, "up")}
                      onMoveDown={() => handleMoveLesson(outlineLessons.length + index, "down")}
                      onDelete={() => handleDeleteLesson(lesson.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ======== Generate Lesson Modal (Quick + Outline modes) ======== */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open && (generating || outlineGenerating)) return; setModalOpen(open); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Lesson with AI
            </DialogTitle>
            <DialogDescription className="sr-only">
              Choose between quick generate or outline mode
            </DialogDescription>
          </DialogHeader>

          {/* Tab bar */}
          <div className="flex rounded-lg bg-muted/60 p-1 gap-1">
            <button
              onClick={() => setGenerateMode("quick")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                generateMode === "quick"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              Quick Generate
            </button>
            <button
              onClick={() => setGenerateMode("outline")}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                generateMode === "outline"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutList className="h-4 w-4" />
              Outline Mode
            </button>
          </div>

          {/* ============ QUICK GENERATE MODE ============ */}
          {generateMode === "quick" && (
          <div className="space-y-5">
            {/* Lesson Name */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Lesson Name <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {lessonName.length}/{MAX_TITLE_LENGTH}
                </span>
              </div>
              <Input
                placeholder="e.g., Introduction to Machine Learning"
                value={lessonName}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_TITLE_LENGTH) {
                    setLessonName(e.target.value);
                  }
                }}
                className="h-10"
                disabled={generating}
              />
            </div>

            {/* Course Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Content Prompt <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {lessonPrompt.length}/{MAX_DESC_LENGTH}
                </span>
              </div>
              <Textarea
                placeholder="Describe the content you want to generate..."
                value={lessonPrompt}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_DESC_LENGTH) {
                    setLessonPrompt(e.target.value);
                  }
                }}
                rows={4}
                className="resize-none"
                disabled={generating}
              />
            </div>

            {/* PDF Courseware Upload */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">PDF Courseware</Label>
              <button
                type="button"
                onClick={handleLessonPdfUpload}
                disabled={generating}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30 disabled:opacity-50"
              >
                <FileUp className="h-4 w-4" />
                {lessonPdfName ? (
                  <span className="text-foreground font-medium">
                    {lessonPdfName}
                  </span>
                ) : (
                  "Click to upload PDF courseware (optional)"
                )}
              </button>
              <input
                ref={lessonFileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleLessonFileChange}
              />
            </div>

            {/* Language */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Generated Content Language
              </Label>
              <RadioGroup
                value={lessonLanguage}
                onValueChange={setLessonLanguage}
                className="flex gap-6"
                disabled={generating}
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="chinese"
                    id="sec-lang-zh"
                  />
                  <Label
                    htmlFor="sec-lang-zh"
                    className="cursor-pointer text-sm font-normal"
                  >
                    Chinese
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem
                    value="english"
                    id="sec-lang-en"
                  />
                  <Label
                    htmlFor="sec-lang-en"
                    className="cursor-pointer text-sm font-normal"
                  >
                    English
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* ---- Live Streaming Preview ---- */}
            {showStreamPreview && (
              <div ref={streamPreviewRef} className="space-y-2">
                <div className="flex items-center gap-2">
                  {generating && (
                    <div className="flex items-center gap-1.5 text-xs text-primary">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Generating live preview...</span>
                    </div>
                  )}
                  {!generating && streamingHtml && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Generation complete</span>
                    </div>
                  )}
                </div>
                <div className="rounded-lg border border-border/60 overflow-hidden bg-muted/10">
                  <iframe
                    srcDoc={streamingHtml || "<div style=\"display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:14px;\">Waiting for content...</div>"}
                    sandbox="allow-same-origin"
                    className="w-full border-0"
                    style={{ aspectRatio: "16/9" }}
                    title="Live generation preview"
                  />
                </div>
              </div>
            )}
          </div>
          )}

          {/* Quick Generate Footer */}
          {generateMode === "quick" && (
          <DialogFooter className="mt-2">
            {generating ? (
              <Button
                variant="destructive"
                onClick={handleCancelGeneration}
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Cancel Generation
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateLesson}
                  disabled={!lessonName.trim() || !lessonPrompt.trim()}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate
                </Button>
              </>
            )}
          </DialogFooter>
          )}
          {generateMode === "outline" && (
            <div className="space-y-5">
              {/* Topic */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Topic <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="e.g., Introduction to Data Science"
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
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
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
                        if (!isNaN(v)) setOutlineSlideCount(Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, v)));
                      }}
                      className="h-9 w-16 text-center"
                      disabled={outlineGenerating}
                    />
                    <button
                      onClick={() => setOutlineSlideCount((p) => Math.min(MAX_SLIDES, p + 1))}
                      disabled={outlineGenerating || outlineSlideCount >= MAX_SLIDES}
                      className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Style */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Design Style</Label>
                  <Select value={outlineStyle} onValueChange={setOutlineStyle} disabled={outlineGenerating}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SLIDE_STYLES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          <div className="flex items-center gap-2">
                            <span>{s.label}</span>
                            <span className="text-xs text-muted-foreground">{s.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* ---- Loading state ---- */}
              {outlineGenerating && (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Generating slide outline...</p>
                </div>
              )}

              {/* ---- Editable Outline List ---- */}
              {!outlineGenerating && editingOutlineLesson && outlineEditingSlides.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-semibold text-foreground">
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

                  <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                    {outlineEditingSlides.map((slide, i) => (
                      <div
                        key={slide.id}
                        className="group flex items-start gap-3 rounded-lg border border-border/50 bg-card p-3 transition-colors hover:border-primary/30"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {i + 1}
                        </div>
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <input
                            value={slide.title}
                            onChange={(e) => {
                              const newTitle = e.target.value;
                              setOutlineEditingSlides((prev) =>
                                prev.map((s) => (s.id === slide.id ? { ...s, title: newTitle } : s))
                              );
                            }}
                            onBlur={() => {
                              if (slide.slideId) handleUpdateSlideTitle(slide.slideId, slide.title);
                            }}
                            className="w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/50 border-b border-transparent focus:border-primary/30 transition-colors"
                            placeholder="Slide title..."
                          />
                          {slide.outline && (
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                              {slide.outline}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteOutlineSlide(slide.slideId || "", slide.id)}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
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
          )}
          </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================
// Lesson Card with mini preview
// ============================================

interface LessonCardProps {
  lesson: LessonDraft;
  index: number;
  totalCount: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function LessonCard({
  lesson,
  index,
  totalCount,
  expanded,
  onToggleExpand,
  onMoveUp,
  onMoveDown,
  onDelete,
}: LessonCardProps) {
  const hasContent = !!lesson.htmlBody;

  return (
    <div
      className={`group rounded-lg border transition-colors ${
        hasContent
          ? "border-border/60 bg-card hover:bg-accent/30"
          : "border-dashed border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/10"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Grip / Reorder */}
        <div className="flex flex-col items-center gap-0.5 text-muted-foreground/50">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="rounded p-0.5 hover:text-muted-foreground disabled:opacity-30 disabled:hover:text-muted-foreground/50"
            aria-label="Move lesson up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <GripVertical className="h-3.5 w-3.5" />
          <button
            onClick={onMoveDown}
            disabled={index === totalCount - 1}
            className="rounded p-0.5 hover:text-muted-foreground disabled:opacity-30 disabled:hover:text-muted-foreground/50"
            aria-label="Move lesson down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Number Badge */}
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            hasContent
              ? "bg-primary/10 text-primary"
              : "bg-amber-400/20 text-amber-600"
          }`}
        >
          {index + 1}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {lesson.title}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {hasContent ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Ready
                </span>
                <span>·</span>
                <span>{lesson.language === "chinese" ? "中文" : "English"}</span>
              </>
            ) : (
              <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                No content
              </span>
            )}
          </div>
        </div>

        {/* Preview Toggle */}
        {hasContent && (
          <button
            onClick={onToggleExpand}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
              expanded
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted"
            }`}
            title={expanded ? "Hide preview" : "Show preview"}
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Delete Button */}
        <button
          onClick={onDelete}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          aria-label="Delete lesson"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ---- Expanded iframe preview ---- */}
      {expanded && hasContent && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2">
          <div className="rounded-md overflow-hidden border border-border/40">
            <iframe
              srcDoc={lesson.htmlBody}
              sandbox="allow-same-origin"
              className="w-full border-0"
              style={{ aspectRatio: "16/9" }}
              title={`Preview of ${lesson.title}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Outline Lesson Card
// ============================================

interface OutlineLessonCardProps {
  lesson: OutlineLessonDraft;
  index: number;
  expanded: boolean;
  isEditing: boolean;
  editingSlides: OutlineSlideDraft[];
  onToggleExpand: () => void;
  onEditOutline: () => void;
  onUpdateSlideTitle: (slideId: string, newTitle: string) => void;
  onDeleteSlide: (slideId: string, localId: string) => void;
  onGenerateSlides: () => void;
  onDelete: () => void;
}

function OutlineLessonCard({
  lesson,
  index,
  expanded,
  isEditing,
  editingSlides,
  onToggleExpand,
  onEditOutline,
  onUpdateSlideTitle,
  onDeleteSlide,
  onGenerateSlides,
  onDelete,
}: OutlineLessonCardProps) {
  const styleLabel = SLIDE_STYLES.find((s) => s.value === lesson.style)?.label || lesson.style;

  return (
    <div className="group rounded-lg border border-primary/30 bg-primary/[0.02] hover:bg-primary/[0.04] transition-colors">
      <div className="flex items-center gap-3 p-3">
        {/* Number Badge */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {index + 1}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {lesson.title}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
              <LayoutList className="h-2.5 w-2.5" />
              {lesson.slides.length} slides
            </span>
            <span>·</span>
            <span>{styleLabel}</span>
          </div>
        </div>

        {/* Edit outline button */}
        <button
          onClick={onEditOutline}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
          title="Edit outline"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>

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

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          aria-label="Delete lesson"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ---- Expanded slide list ---- */}
      {expanded && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-1.5">
          {lesson.slides.map((slide, i) => (
            <div key={slide.id} className="flex items-center gap-2 rounded-md bg-muted/30 px-2.5 py-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-muted-foreground">
                {i + 1}
              </span>
              <span className="flex-1 truncate text-xs text-foreground">{slide.title}</span>
              {slide.outline && (
                <span className="hidden sm:inline max-w-[140px] truncate text-[10px] text-muted-foreground">{slide.outline}</span>
              )}
              <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                Draft
              </span>
            </div>
          ))}
          <div className="pt-1">
            <Button
              size="sm"
              onClick={onGenerateSlides}
              className="w-full gap-1.5 h-8 text-xs"
            >
              <Play className="h-3 w-3" />
              Generate Slides
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Helpers
// ============================================

/** Build a live preview document from raw streaming HTML fragments */
function buildLivePreviewDoc(rawHtml: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeAttr(title)}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
  * { box-sizing: border-box; }
  .streaming-cursor::after {
    content: '▊';
    animation: blink 0.7s infinite;
    color: currentColor;
    opacity: 0.7;
  }
  @keyframes blink { 0%, 50% { opacity: 0.7; } 51%, 100% { opacity: 0; } }
</style>
</head>
<body class="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
  <div class="streaming-cursor">${rawHtml}</div>
</body>
</html>`;
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
