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
  FileUp,
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
import { DEFAULT_STYLE, MIN_SLIDES, MAX_SLIDES, DEFAULT_SLIDE_COUNT } from "@/lib/slide-styles";
import { MAX_QUIZ_QUESTIONS, MIN_QUIZ_QUESTIONS } from "@/lib/quiz/schema";
import {
  OutlineLessonCard,
  OutlineLessonCardProps,
  OutlineLessonDraft,
  OutlineSlideDraft,
  SlideGenState,
} from "@/components/lms/create-course/outline-lesson-card";
import { UploadDeckDialog } from "@/components/lms/create-course/upload-deck-dialog";
import { useCourseUploads } from "@/hooks/use-course-uploads";
import { useCourseDraft } from "@/hooks/use-course-draft";
import { useLessonWorkflow } from "@/hooks/use-lesson-workflow";
import {
  MAX_LESSONS,
  MAX_TITLE_LENGTH,
  MAX_DESC_LENGTH,
  MAX_COURSE_DESC_LENGTH,
} from "@/components/lms/create-course/model";

// ============================================
// Create Course — the page
//
// The template. Every field, panel and dialog the instructor sees is here, and
// nothing else: the course record is useCourseDraft, the plan-then-generate
// workflow is useLessonWorkflow, and file handling is useCourseUploads. The
// page's job is to wire the three together and render them.
// ============================================

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
  const router = useRouter();

  // The second way to add a lesson: a deck the instructor already has.
  const [uploadOpen, setUploadOpen] = useState(false);

  // The two halves of the page, in the order the data flows: the course record
  // reads the saved course, and the workflow adopts its lessons.
  const course = useCourseDraft({ coverImage, setCoverImage });

  const workflow = useLessonWorkflow({
    courseId: course.courseId,
    language: course.language,
    ensureCourseSaved: course.ensureCourseSaved,
    referenceFiles,
    setReferenceFiles,
    loadedLessons: course.loadedLessons,
  });

  // Names the JSX below already uses, kept rather than rewriting the template.
  const {
    title,
    setTitle,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    language,
    setLanguage,
    categories,
    loading,
    saving,
    courseId,
  } = course;
  const handleSave = () => course.publishCourse(workflow.generatingLessonId !== null);

  const {
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
    outlineLessons,
    setOutlineLessons,
    expandedOutlineLessonId,
    setExpandedOutlineLessonId,
    generatingLessonId,
    slideGenStates,
    genStage,
    currentGenSlideId,
    genProgress,
    slidesLoading,
    etaSeconds,
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
  } = workflow;

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
              {/* Wraps rather than overflowing: two buttons and a heading do not
                  fit on one line in a narrow panel, and the second button used
                  to run past the card's edge. */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="text-foreground text-base font-semibold">Lessons</h2>
                  <Badge variant="secondary" className="text-xs font-normal">
                    {outlineLessons.length}/{MAX_LESSONS}
                  </Badge>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setUploadOpen(true)}
                    disabled={outlineLessons.length >= MAX_LESSONS || !!generatingLessonId}
                    className="gap-1.5"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Upload a Deck</span>
                    <span className="sm:hidden">Upload</span>
                  </Button>
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
              </div>

              {outlineLessons.length === 0 ? (
                <div className="border-border/70 bg-muted/20 flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
                  <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full">
                    <FileText className="text-muted-foreground h-5 w-5" />
                  </div>
                  <p className="text-muted-foreground mt-3 text-sm">No lessons yet</p>
                  <p className="text-muted-foreground/70 mt-1 text-xs">
                    <span className="text-primary font-medium">Generate Lesson with AI</span>, or{" "}
                    <span className="text-primary font-medium">Upload a Deck</span> you already
                    have.
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
                      previewLoading={slidesLoading}
                      etaSeconds={ol.id === generatingLessonId ? etaSeconds : null}
                      onToggleExpand={() =>
                        setExpandedOutlineLessonId((prev) => (prev === ol.id ? null : ol.id))
                      }
                      onEditOutline={() => {
                        setEditingOutlineLesson(ol.id);
                        setOutlineEditingSlides(ol.slides);
                        setOutlineTopic(ol.topic);
                        setOutlineSlideCount(ol.slides.length);
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

      {/* ======== Upload a deck as a lesson ======== */}
      <UploadDeckDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        ensureCourseSaved={course.ensureCourseSaved}
        onImported={(lessonId) => {
          // Straight to the review screen: the slides are already there, and
          // the quiz — if one was asked for — is written while it is read.
          router.push(lessonPreviewPath(lessonId));
        }}
      />

      {/* ======== Generate Lesson Modal (Unified Outline Flow) ======== */}
      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open && outlineGenerating) return;
          setModalOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"
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
              {/* A textarea, not a single line: the planner reads this as the
                  brief for the whole lesson — who it is for, what to cover —
                  and a one-line box hid everything but the last few words of
                  it while it was being written. */}
              <Textarea
                placeholder="e.g., Train our support team on how AI agents work — what an agent is, what it's made of, the loop, RAG, MCP, function calling and guardrails, with a worked example and what to watch out for"
                value={outlineTopic}
                onChange={(e) => setOutlineTopic(e.target.value)}
                rows={3}
                className="resize-y text-sm"
                disabled={outlineGenerating}
              />
            </div>

            {/* Slide count and quiz length, side by side: both are "how much of
                this do I want", and both are the instructor's call. */}
            <div className="grid grid-cols-2 gap-4">
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

              {/* Quiz questions */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Quiz Questions</Label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setOutlineQuestionCount((p) => Math.max(MIN_QUIZ_QUESTIONS, p - 1))
                    }
                    disabled={outlineGenerating || outlineQuestionCount <= MIN_QUIZ_QUESTIONS}
                    className="border-border text-muted-foreground hover:bg-muted flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:opacity-40"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <Input
                    type="number"
                    min={MIN_QUIZ_QUESTIONS}
                    max={MAX_QUIZ_QUESTIONS}
                    value={outlineQuestionCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v))
                        setOutlineQuestionCount(
                          Math.max(MIN_QUIZ_QUESTIONS, Math.min(MAX_QUIZ_QUESTIONS, v)),
                        );
                    }}
                    className="h-9 w-16 text-center"
                    disabled={outlineGenerating}
                  />
                  <button
                    onClick={() =>
                      setOutlineQuestionCount((p) => Math.min(MAX_QUIZ_QUESTIONS, p + 1))
                    }
                    disabled={outlineGenerating || outlineQuestionCount >= MAX_QUIZ_QUESTIONS}
                    className="border-border text-muted-foreground hover:bg-muted flex h-9 w-9 items-center justify-center rounded-md border transition-colors disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
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
