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

interface OutlineSection {
  title: string;
  summary: string;
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

  // ---- UI state ----
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  // ---- Modal state ----
  const [lessonName, setLessonName] = useState("");
  const [lessonPrompt, setLessonPrompt] = useState("");
  const [lessonLanguage, setLessonLanguage] = useState("english");
  const [lessonPdfName, setLessonPdfName] = useState("");

  // ---- Live streaming state ----
  const [streamingHtml, setStreamingHtml] = useState("");
  const [showStreamPreview, setShowStreamPreview] = useState(false);
   const streamPreviewRef = useRef<HTMLDivElement>(null);

  // ---- Outline generation state ----
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [outlineModalOpen, setOutlineModalOpen] = useState(false);
  const [outlineTopic, setOutlineTopic] = useState("");
  const [outlineSections, setOutlineSections] = useState<OutlineSection[]>([]);

  // ---- Expanded lesson preview ----
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

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

  // ---- Outline generation ----
  const handleOpenOutlineModal = () => {
    setOutlineTopic(title || "");
    setOutlineSections([]);
    setOutlineModalOpen(true);
  };

  const handleGenerateOutline = useCallback(async () => {
    if (!outlineTopic.trim()) {
      toast.error("Please enter a course topic");
      return;
    }

    setOutlineGenerating(true);
    try {
      const res = await fetch("/api/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: outlineTopic.trim(),
          prompt: `Create a comprehensive course outline for: ${outlineTopic.trim()}. Include 4-6 lessons that progressively build understanding.`,
          language,
        }),
      });

      const json = await res.json();
      if (json.success && json.data) {
        setOutlineSections(json.data.lessons || []);
        if (json.data.title && !title) {
          setTitle(json.data.title);
        }
        toast.success("Outline generated! Select lessons to generate.");
      } else {
        toast.error(json.error || "Failed to generate outline");
      }
    } catch {
      toast.error("Failed to generate outline. Please try again.");
    } finally {
      setOutlineGenerating(false);
    }
  }, [outlineTopic, language, title]);

  const handleAddOutlineSections = () => {
    // Add outline lessons as drafts (without htmlBody yet)
    const newDrafts: LessonDraft[] = outlineSections.map((sec, i) => ({
      id: `sec_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      title: sec.title,
      totalPages: 1,
      htmlBody: "",
      language,
    }));

    const total = lessons.length + newDrafts.length;
    if (total > MAX_LESSONS) {
      toast.error(`Can only add ${MAX_LESSONS - lessons.length} more lessons`);
      return;
    }

    setLessons((prev) => [...prev, ...newDrafts]);
    setOutlineModalOpen(false);
    toast.success(`${newDrafts.length} lessons added. Click the generate button on each to create content.`);
  };

  // ---- Form submission ----
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Course title is required");
      return;
    }

    // Check if any lesson is missing htmlBody
    const missingContent = lessons.filter((s) => !s.htmlBody);
    if (missingContent.length > 0) {
      toast.error(`${missingContent.length} lesson(s) have no content yet. Generate content for all lessons first.`);
      return;
    }

    setSaving(true);
    try {
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
    } catch {
      toast.error("Failed to create course. Please try again.");
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
                    {lessons.length}/{MAX_LESSONS}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenOutlineModal}
                    disabled={lessons.length >= MAX_LESSONS}
                    className="gap-1.5"
                    title="AI Generate Outline"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Outline</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenModal}
                    disabled={lessons.length >= MAX_LESSONS}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
              </div>

              {/* Lesson List */}
              {lessons.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 py-16">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    No lessons yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Click <span className="font-medium text-foreground">Outline</span> to AI-generate a structure, or <span className="font-medium text-foreground">+ Add</span> manually
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                  {lessons.map((lesson, index) => (
                    <LessonCard
                      key={lesson.id}
                      lesson={lesson}
                      index={index}
                      totalCount={lessons.length}
                      expanded={expandedLessonId === lesson.id}
                      onToggleExpand={() =>
                        setExpandedLessonId((prev) =>
                          prev === lesson.id ? null : lesson.id
                        )
                      }
                      onMoveUp={() => handleMoveLesson(index, "up")}
                      onMoveDown={() => handleMoveLesson(index, "down")}
                      onDelete={() => handleDeleteLesson(lesson.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ======== Add Lesson Modal ======== */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!open && generating) return; setModalOpen(open); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Generate Lesson with AI
            </DialogTitle>
            <DialogDescription>
              Provide a lesson name and prompt. The AI will generate slide content in real time.
            </DialogDescription>
          </DialogHeader>

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
        </DialogContent>
      </Dialog>

      {/* ======== AI Outline Generation Modal ======== */}
      <Dialog open={outlineModalOpen} onOpenChange={setOutlineModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Course Outline
            </DialogTitle>
            <DialogDescription>
              Enter a topic and the AI will generate a structured course outline with suggested lessons.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Course Topic <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g., Introduction to Data Science"
                value={outlineTopic}
                onChange={(e) => setOutlineTopic(e.target.value)}
                disabled={outlineGenerating}
                className="h-10"
              />
            </div>

            {outlineSections.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Generated Outline
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {outlineSections.length} lessons
                  </Badge>
                </Label>
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2 max-h-64 overflow-y-auto">
                  {outlineSections.map((sec, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-md bg-background p-2.5 border border-border/40"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{sec.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                          {sec.summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="ghost"
              onClick={() => setOutlineModalOpen(false)}
              disabled={outlineGenerating}
            >
              Cancel
            </Button>
            {outlineSections.length === 0 ? (
              <Button
                onClick={handleGenerateOutline}
                disabled={!outlineTopic.trim() || outlineGenerating}
                className="gap-2"
              >
                {outlineGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Outline
                  </>
                )}
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleGenerateOutline}
                  disabled={outlineGenerating}
                  className="gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Regenerate
                </Button>
                <Button
                  onClick={handleAddOutlineSections}
                  disabled={lessons.length + outlineSections.length > MAX_LESSONS}
                  className="gap-2"
                >
                  Add {outlineSections.length} Lessons
                </Button>
              </div>
            )}
          </DialogFooter>
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
