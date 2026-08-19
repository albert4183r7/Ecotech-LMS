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
import { useNavigationStore, useUserStore, useCourseStore } from "@/stores/lms-store";
import type { CategoryItem } from "@/types/lms";
import { toast } from "sonner";
import { SLIDE_STYLES, MIN_SLIDES, MAX_SLIDES, DEFAULT_SLIDE_COUNT } from "@/lib/slide-styles";

// ============================================
// Types
// ============================================

/** Slide in an editable outline */
interface OutlineSlideDraft {
  id: string;
  slideId: string | null;
  title: string;
  outline: string;
  order: number;
}

/** Per-slide generation state */
interface SlideGenState {
  status: "pending" | "generating" | "complete" | "error";
  htmlBody?: string;
  error?: string;
}

/** A lesson created via the outline flow (persisted in DB) */
interface OutlineLessonDraft {
  id: string;
  title: string;
  slides: OutlineSlideDraft[];
  language: string;
  style: string;
  topic: string;
  // Generation state
  allReady?: boolean;
}

// ============================================
// Constants
// ============================================

const MAX_LESSONS = 10;
const MAX_TITLE_LENGTH = 100;
const MAX_DESC_LENGTH = 3000;
const MAX_COURSE_DESC_LENGTH = 500;

// ============================================
// Create Course Page Component
// ============================================

export function CreateCoursePage() {
  const { goBack } = useNavigationStore();
  const { currentUserId } = useUserStore();
  const { createPrompt, setCreatePrompt } = useCourseStore();

  // ---- Course form state ----
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [language, setLanguage] = useState("english");
  const [coverImage, setCoverImage] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);

  // ---- UI state ----
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [docUploading, setDocUploading] = useState(false);

  // ---- Reference documents state ----
  const [referenceFiles, setReferenceFiles] = useState<{ name: string; url: string; size: number; type: string }[]>([]);

  // ---- Outline modal state ----
  const [outlineTopic, setOutlineTopic] = useState("");
  const [outlineSlideCount, setOutlineSlideCount] = useState(DEFAULT_SLIDE_COUNT);
  const [outlineStyle, setOutlineStyle] = useState("professional");
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
  const [currentGenSlideId, setCurrentGenSlideId] = useState<string | null>(null);
  const [streamingHtml, setStreamingHtml] = useState("");
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
  const abortGenRef = useRef<AbortController | null>(null);

  // ---- Refs ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

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

  // ---- Cover image handlers (local file upload) ----
  const handleCoverUpload = () => {
    fileInputRef.current?.click();
  };

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side validation
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
    if (!validTypes.includes(file.type)) {
      toast.error("Please select a valid image (JPEG, PNG, WebP, GIF, SVG)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB");
      return;
    }

    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload?type=cover", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        setCoverImage(json.data.url);
        setCoverPreview(json.data.url);
        toast.success("Cover image uploaded");
      } else {
        toast.error(json.error || "Failed to upload image");
      }
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setCoverUploading(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ---- Reference document handlers ----
  const handleDocUploadClick = () => {
    docInputRef.current?.click();
  };

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setDocUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload?type=doc", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();
        if (json.success) {
          setReferenceFiles((prev) => [...prev, json.data]);
        } else {
          toast.error(`Failed to upload: ${file.name}`);
        }
      }
    } catch {
      toast.error("Failed to upload document");
    } finally {
      setDocUploading(false);
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  const handleRemoveDoc = (url: string) => {
    setReferenceFiles((prev) => prev.filter((f) => f.url !== url));
  };

  const handleRemoveCover = () => {
    setCoverImage("");
    setCoverPreview(null);
  };

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
    setOutlineStyle("professional");
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
      toast.error("Topic is required");
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
          referenceFileUrls: referenceFiles.length > 0 ? referenceFiles.map((f) => f.url) : undefined,
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

      const newLesson: OutlineLessonDraft = {
        id: lessonData.id,
        title: lessonData.title,
        slides,
        language: outlineLanguage,
        style: outlineStyle,
        topic: outlineTopic.trim(),
      };

      setOutlineLessons((prev) => [...prev, newLesson]);
      setEditingOutlineLesson(lessonData.id);
      setOutlineEditingSlides(slides);
      setOutlineGenerating(false);
      toast.success(`Outline generated: ${slides.length} slides`);
    } catch {
      toast.error("Failed to generate outline. Please try again.");
      setOutlineGenerating(false);
    }
  }, [outlineTopic, outlineSlideCount, outlineStyle, outlineLanguage, referenceFiles, ensureCourseSaved, outlineLessons.length]);

  // ---- Update slide title (inline edit) ----
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
        ol.id === editingOutlineLesson
          ? { ...ol, slides: [...ol.slides, newSlide] }
          : ol
      )
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
          referenceFileUrls: referenceFiles.length > 0 ? referenceFiles.map((f) => f.url) : undefined,
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

  // ============================================
  // GENERATE SLIDES — Streaming HTML for all slides
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
      setCurrentGenSlideId(null);
      setStreamingHtml("");
      setGenProgress({ current: 0, total: lesson.slides.length });
      setExpandedOutlineLessonId(lessonId);

      // Close modal if open
      setModalOpen(false);

      const abort = new AbortController();
      abortGenRef.current = abort;

      try {
        const res = await fetch("/api/lessons/generate-slides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            language: lesson.language,
          }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          toast.error("Failed to start slide generation");
          setGeneratingLessonId(null);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let slidesCompleted = 0;
        let rawHtmlAccum = "";

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

              // Top-level error event (no slideId) — e.g. "Lesson not found"
              if (data.error && !data.slideId) {
                toast.error(data.error);
                break; // Stop processing
              }

              if (data.slideId && data.slideTitle && data.totalSlides !== undefined) {
                // slide_start event
                setCurrentGenSlideId(data.slideId);
                setSlideGenStates((prev) => ({
                  ...prev,
                  [data.slideId]: { status: "generating" },
                }));
                rawHtmlAccum = "";
                setGenProgress({ current: data.slideIndex + 1, total: data.totalSlides });
              }

              if (data.slideId && data.html) {
                // chunk event
                rawHtmlAccum += data.html;
                setStreamingHtml(buildLivePreviewDoc(rawHtmlAccum, data.slideId));
              }

              if (data.slideId && data.htmlBody) {
                // slide_complete event
                slidesCompleted++;
                setSlideGenStates((prev) => ({
                  ...prev,
                  [data.slideId]: { status: "complete", htmlBody: data.htmlBody },
                }));
                setOutlineLessons((prev) =>
                  prev.map((ol) =>
                    ol.id === lessonId ? { ...ol, allReady: slidesCompleted === ol.slides.length } : ol
                  )
                );
              }

              if (data.slideId && data.error) {
                // slide_error event
                slidesCompleted++;
                setSlideGenStates((prev) => ({
                  ...prev,
                  [data.slideId]: { status: "error", error: data.error },
                }));
              }

              if (data.lessonId && data.slidesGenerated !== undefined) {
                // all_complete event
                toast.success(`All ${data.slidesGenerated} slides generated!`);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          toast.info("Generation cancelled");
        } else {
          toast.error("Failed to generate slides. Please try again.");
        }
      } finally {
        setGeneratingLessonId(null);
        setCurrentGenSlideId(null);
        abortGenRef.current = null;
      }
    },
    [outlineLessons]
  );

  const handleCancelGeneration = () => {
    abortGenRef.current?.abort();
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
                    disabled={coverUploading}
                    className="flex h-48 w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border/70 bg-muted/30 transition-colors hover:border-primary/50 hover:bg-muted/50 disabled:opacity-50"
                  >
                    {coverUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">
                        {coverUploading ? "Uploading..." : "Upload cover image"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Recommended 1920×1080
                      </p>
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
                  <Label htmlFor="course-description" className="text-sm font-medium">
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
                className="w-full h-10"
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
                  <h2 className="text-base font-semibold text-foreground">Lessons</h2>
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
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 py-16">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">No lessons yet</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Click <span className="font-medium text-primary">Generate Lesson with AI</span> to create your first lesson.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {outlineLessons.map((ol, index) => (
                    <OutlineLessonCard
                      key={ol.id}
                      lesson={ol}
                      index={index}
                      expanded={expandedOutlineLessonId === ol.id}
                      isGenerating={generatingLessonId === ol.id}
                      slideGenStates={slideGenStates}
                      currentGenSlideId={currentGenSlideId}
                      streamingHtml={streamingHtml}
                      genProgress={genProgress}
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
                      }}
                      onUpdateSlideTitle={(slideId, newTitle) => handleUpdateSlideTitle(slideId, newTitle)}
                      onDeleteSlide={(slideId, localId) => handleDeleteOutlineSlide(slideId, localId)}
                      onGenerateSlides={() => handleGenerateSlides(ol.id)}
                      onCancelGeneration={handleCancelGeneration}
                      onDelete={() => handleDeleteOutlineLesson(ol.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ======== Generate Lesson Modal (Unified Outline Flow) ======== */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open && outlineGenerating) return; setModalOpen(open); }}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
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
                <Select value={outlineLanguage} onValueChange={setOutlineLanguage} disabled={outlineGenerating}>
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
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
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
                  className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border/70 bg-muted/30 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
                >
                  {docUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {docUploading ? "Uploading..." : "Upload Documents"}
                </button>
                <p className="text-[10px] text-muted-foreground">
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
                    className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1 truncate text-xs text-foreground">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      onClick={() => handleRemoveDoc(f.url)}
                      disabled={outlineGenerating}
                      className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
        </DialogContent>
      </Dialog>
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
  isGenerating: boolean;
  slideGenStates: Record<string, SlideGenState>;
  currentGenSlideId: string | null;
  streamingHtml: string;
  genProgress: { current: number; total: number };
  onToggleExpand: () => void;
  onEditOutline: () => void;
  onUpdateSlideTitle: (slideId: string, newTitle: string) => void;
  onDeleteSlide: (slideId: string, localId: string) => void;
  onGenerateSlides: () => void;
  onCancelGeneration: () => void;
  onDelete: () => void;
}

function OutlineLessonCard({
  lesson,
  index,
  expanded,
  isGenerating,
  slideGenStates,
  currentGenSlideId,
  streamingHtml,
  genProgress,
  onToggleExpand,
  onEditOutline,
  onUpdateSlideTitle,
  onDeleteSlide,
  onGenerateSlides,
  onCancelGeneration,
  onDelete,
}: OutlineLessonCardProps) {
  const styleLabel = SLIDE_STYLES.find((s) => s.value === lesson.style)?.label || lesson.style;
  const hasReadySlides = lesson.slides.some((s) => s.slideId && slideGenStates[s.slideId]?.status === "complete");
  const allComplete = lesson.allReady || lesson.slides.every(
    (s) => !s.slideId || slideGenStates[s.slideId]?.status === "complete"
  );
  const completedCount = lesson.slides.filter(
    (s) => s.slideId && slideGenStates[s.slideId]?.status === "complete"
  ).length;

  const firstCompletedHtml = (() => {
    const found = lesson.slides.find((s) => s.slideId && slideGenStates[s.slideId]?.htmlBody);
    return found?.slideId ? (slideGenStates[found.slideId]?.htmlBody || "") : "";
  })();

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
              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
              : isGenerating
                ? "bg-primary/10 text-primary animate-pulse"
                : "bg-primary/10 text-primary"
          }`}
        >
          {allComplete ? <Check className="h-3.5 w-3.5" /> : index + 1}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{lesson.title}</p>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {allComplete ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                <Check className="h-2.5 w-2.5" />
                Ready
              </span>
            ) : isGenerating ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Generating {genProgress.current}/{genProgress.total}
              </span>
            ) : hasReadySlides ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                {completedCount}/{lesson.slides.length} slides
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-400">
                <LayoutList className="h-2.5 w-2.5" />
                {lesson.slides.length} slides
              </span>
            )}
            <span>·</span>
            <span>{styleLabel}</span>
          </div>
        </div>

        {/* Edit outline button (only when not generating and not all complete) */}
        {!isGenerating && !allComplete && (
          <button
            onClick={onEditOutline}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-primary/10 hover:text-primary group-hover:opacity-100"
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
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            aria-label="Delete lesson"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ---- Expanded content ---- */}
      {expanded && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2 space-y-3">
          {/* Generation progress bar */}
          {isGenerating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Generating slide {genProgress.current} of {genProgress.total}...
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onCancelGeneration}
                  className="h-6 gap-1 text-xs text-destructive hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                  Cancel
                </Button>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{
                    width: `${genProgress.total > 0 ? (genProgress.current / genProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Streaming preview for current generating slide */}
          {isGenerating && streamingHtml && (
            <div className="rounded-lg border border-border/60 overflow-hidden bg-muted/10">
              <div className="px-2 py-1 bg-muted/30 text-[10px] text-muted-foreground font-medium">
                Live Preview — Slide {genProgress.current}
              </div>
              <iframe
                srcDoc={streamingHtml}
                sandbox="allow-same-origin"
                className="w-full border-0"
                style={{ aspectRatio: "16/9" }}
                title="Live generation preview"
              />
            </div>
          )}

          {/* Slide list */}
          <div className="space-y-1.5">
            {lesson.slides.map((slide, i) => {
              const genState = slide.slideId ? slideGenStates[slide.slideId] : null;
              const isCurrentGen = slide.slideId === currentGenSlideId;

              return (
                <div
                  key={slide.id}
                  className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors ${
                    isCurrentGen
                      ? "bg-primary/10 border border-primary/30"
                      : genState?.status === "complete"
                        ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                        : genState?.status === "error"
                          ? "bg-destructive/5"
                          : "bg-muted/30"
                  }`}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-xs text-foreground">{slide.title}</span>

                  {/* Status icon */}
                  {genState?.status === "generating" && (
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  )}
                  {genState?.status === "complete" && (
                    <Check className="h-3 w-3 text-emerald-500" />
                  )}
                  {genState?.status === "error" && (
                    <AlertCircle className="h-3 w-3 text-destructive" title={genState.error} />
                  )}
                  {!genState && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      Draft
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Generate Slides button (only when not generating and not all complete) */}
          {!isGenerating && !allComplete && (
            <Button
              size="sm"
              onClick={onGenerateSlides}
              className="w-full gap-1.5 h-8 text-xs"
            >
              <Play className="h-3 w-3" />
              Generate Slides
            </Button>
          )}

          {/* View completed slides (show first slide preview) */}
          {!isGenerating && hasReadySlides && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {completedCount} slide{completedCount !== 1 ? "s" : ""} generated
              </p>
              {/* Show first completed slide as preview */}
              {lesson.slides.some((s) => s.slideId && slideGenStates[s.slideId]?.htmlBody) && (
                <div className="rounded-md overflow-hidden border border-border/40">
                  <iframe
                    srcDoc={firstCompletedHtml}
                    sandbox="allow-same-origin"
                    className="w-full border-0"
                    style={{ aspectRatio: "16/9" }}
                    title={`Preview of ${lesson.title}`}
                  />
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

/** Build a live preview document from raw streaming HTML fragments */
function buildLivePreviewDoc(rawHtml: string, _slideId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Slide Preview</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
* { box-sizing: border-box; }
.streaming-cursor::after {
  content: '\u258a';
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
