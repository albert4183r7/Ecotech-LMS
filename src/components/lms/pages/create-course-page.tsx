"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft,
  Upload,
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
import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import type { CategoryItem, SlideContent } from "@/types/lms";
import { toast } from "sonner";

// ============================================
// Types
// ============================================

interface SectionDraft {
  id: string;
  title: string;
  totalPages: number;
  content: string;
  language: string;
}

// ============================================
// Helper: Generate placeholder slides
// ============================================

function generatePlaceholderSlides(
  sectionName: string,
  language: string
): SlideContent[] {
  const count = 4 + Math.floor(Math.random() * 3); // 4-6 slides
  const slides: SlideContent[] = [];

  // Title slide
  slides.push({
    title: sectionName,
    type: "title",
    subtitle:
      language === "chinese"
        ? "在本节中，我们将深入了解相关内容"
        : "In this section, we will dive deep into the topic",
  });

  // Content slides
  const contentTemplates =
    language === "chinese"
      ? [
          {
            type: "content" as const,
            title: `核心概念`,
            items: [
              {
                heading: "要点一",
                text: `理解${sectionName}的基本原理和核心概念，建立坚实的理论基础。`,
              },
              {
                heading: "要点二",
                text: `掌握${sectionName}中的关键技术和最佳实践。`,
              },
              {
                heading: "要点三",
                text: `能够将所学知识应用到实际场景中解决问题。`,
              },
            ],
          },
          {
            type: "list" as const,
            title: `关键知识点`,
            items: [
              { text: `${sectionName}的定义与背景` },
              { text: "基本原理与核心机制" },
              { text: "常见应用场景分析" },
              { text: "实际案例与实践方法" },
              { text: "常见问题与解决方案" },
            ],
          },
          {
            type: "table" as const,
            title: `对比分析`,
            tableData: {
              headers: ["特性", "方案A", "方案B", "方案C"],
              rows: [
                ["易用性", "高", "中", "低"],
                ["性能", "中", "高", "高"],
                ["扩展性", "中", "高", "极高"],
                ["学习成本", "低", "中", "高"],
              ],
            },
          },
          {
            type: "code" as const,
            title: `代码示例`,
            codeBlock: {
              language: "typescript",
              code: `// ${sectionName} 示例代码
function example() {
  const data = initializeData();
  const result = processData(data);
  return validateResult(result);
}

example();`,
            },
          },
        ]
      : [
          {
            type: "content" as const,
            title: `Core Concepts`,
            items: [
              {
                heading: "Key Point 1",
                text: `Understanding the fundamental principles and core concepts of ${sectionName.toLowerCase()}.`,
              },
              {
                heading: "Key Point 2",
                text: `Mastering key techniques and best practices in ${sectionName.toLowerCase()}.`,
              },
              {
                heading: "Key Point 3",
                text: `Applying learned knowledge to solve real-world problems.`,
              },
            ],
          },
          {
            type: "list" as const,
            title: `Key Takeaways`,
            items: [
              { text: `Definition and background of ${sectionName.toLowerCase()}` },
              { text: "Fundamental principles and core mechanisms" },
              { text: "Common use case analysis" },
              { text: "Practical examples and methodologies" },
              { text: "Common issues and solutions" },
            ],
          },
          {
            type: "table" as const,
            title: `Comparison Analysis`,
            tableData: {
              headers: ["Feature", "Option A", "Option B", "Option C"],
              rows: [
                ["Ease of Use", "High", "Medium", "Low"],
                ["Performance", "Medium", "High", "High"],
                ["Scalability", "Medium", "High", "Very High"],
                ["Learning Curve", "Low", "Medium", "High"],
              ],
            },
          },
          {
            type: "code" as const,
            title: `Code Example`,
            codeBlock: {
              language: "typescript",
              code: `// ${sectionName} example code
function example() {
  const data = initializeData();
  const result = processData(data);
  return validateResult(result);
}

example();`,
            },
          },
        ];

  // Quiz slide
  const quizTemplate =
    language === "chinese"
      ? {
          type: "quiz" as const,
          title: `知识检测`,
          items: [
            {
              heading: "问题 1",
              text: `以下哪项最准确地描述了${sectionName}的核心概念？`,
            },
            {
              heading: "问题 2",
              text: `在实际应用中，${sectionName}最常见的挑战是什么？`,
            },
          ],
        }
      : {
          type: "quiz" as const,
          title: `Knowledge Check`,
          items: [
            {
              heading: "Question 1",
              text: `Which of the following best describes the core concept of ${sectionName.toLowerCase()}?`,
            },
            {
              heading: "Question 2",
              text: `What is the most common challenge when applying ${sectionName.toLowerCase()} in practice?`,
            },
          ],
        };

  // Pick slides to fill the count
  for (let i = 1; i < count - 1; i++) {
    const template = contentTemplates[i % contentTemplates.length];
    slides.push({ ...template, title: `${sectionName} - ${template.title}` });
  }

  // Always end with quiz if we have room
  if (count > 2) {
    slides.push({
      ...quizTemplate,
      title: `${sectionName} - ${quizTemplate.title}`,
    });
  }

  return slides;
}

// ============================================
// Create Course Page Component
// ============================================

const MAX_SECTIONS = 10;
const MAX_TITLE_LENGTH = 100;
const MAX_DESC_LENGTH = 3000;
const MAX_COURSE_DESC_LENGTH = 500;

export function CreateCoursePage() {
  const { goBack } = useNavigationStore();
  const { currentUserId } = useUserStore();

  // ---- Form state ----
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [language, setLanguage] = useState("english");
  const [coverImage, setCoverImage] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [sections, setSections] = useState<SectionDraft[]>([]);

  // ---- UI state ----
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [urlInputOpen, setUrlInputOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");

  // ---- Modal state ----
  const [sectionName, setSectionName] = useState("");
  const [sectionPrompt, setSectionPrompt] = useState("");
  const [sectionLanguage, setSectionLanguage] = useState("english");
  const [sectionPdfName, setSectionPdfName] = useState("");

  // ---- Refs ----
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sectionFileInputRef = useRef<HTMLInputElement>(null);

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
    // In sandbox, simulate file selection
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

  // ---- Section management ----
  const handleOpenModal = () => {
    setSectionName("");
    setSectionPrompt("");
    setSectionLanguage(language);
    setSectionPdfName("");
    setModalOpen(true);
  };

  const handleGenerateSection = useCallback(() => {
    if (!sectionName.trim()) {
      toast.error("Section name is required");
      return;
    }
    if (!sectionPrompt.trim()) {
      toast.error("Course prompt is required");
      return;
    }
    if (sections.length >= MAX_SECTIONS) {
      toast.error(`Maximum ${MAX_SECTIONS} sections allowed`);
      return;
    }

    setGenerating(true);

    // Simulate generation delay
    setTimeout(() => {
      const slides = generatePlaceholderSlides(
        sectionName.trim(),
        sectionLanguage
      );
      const newSection: SectionDraft = {
        id: `sec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: sectionName.trim(),
        totalPages: slides.length,
        content: JSON.stringify(slides),
        language: sectionLanguage,
      };

      setSections((prev) => [...prev, newSection]);
      setGenerating(false);
      setModalOpen(false);
      toast.success(`Section "${sectionName.trim()}" generated successfully`);
    }, 1200);
  }, [sectionName, sectionPrompt, sectionLanguage, sections.length]);

  const handleDeleteSection = (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
  };

  const handleMoveSection = (index: number, direction: "up" | "down") => {
    const newSections = [...sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    [newSections[index], newSections[targetIndex]] = [
      newSections[targetIndex],
      newSections[index],
    ];
    setSections(newSections);
  };

  // ---- Form submission ----
  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Course title is required");
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
        sections: sections.map((sec, index) => ({
          title: sec.title,
          content: sec.content,
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

  // ---- Section PDF upload simulation ----
  const handleSectionPdfUpload = () => {
    sectionFileInputRef.current?.click();
  };

  const handleSectionFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSectionPdfName(file.name);
      // If no prompt yet, use the filename
      if (!sectionPrompt.trim()) {
        const nameWithoutExt = file.name.replace(/\.pdf$/i, "");
        setSectionPrompt(
          `Generate course content based on the uploaded PDF: ${nameWithoutExt}`
        );
        if (!sectionName.trim()) {
          setSectionName(nameWithoutExt);
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
                        Recommended 1920x1080
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
                    {title.length}/100
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

        {/* ======== Right Panel: Sections (2 cols) ======== */}
        <div className="lg:col-span-2">
          <Card className="border-border/50">
            <CardContent className="p-6">
              {/* Header */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-foreground">
                    Sections
                  </h2>
                  <Badge
                    variant="secondary"
                    className="text-xs font-normal"
                  >
                    {sections.length}/{MAX_SECTIONS}
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOpenModal}
                  disabled={sections.length >= MAX_SECTIONS}
                  className="gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Section
                </Button>
              </div>

              {/* Section List */}
              {sections.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 py-16">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    No sections yet
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Click "+ Add Section" to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {sections.map((section, index) => (
                    <div
                      key={section.id}
                      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:bg-accent/30"
                    >
                      {/* Grip / Drag Handle */}
                      <div className="flex flex-col items-center gap-0.5 text-muted-foreground/50">
                        <button
                          onClick={() =>
                            handleMoveSection(index, "up")
                          }
                          disabled={index === 0}
                          className="rounded p-0.5 hover:text-muted-foreground disabled:opacity-30 disabled:hover:text-muted-foreground/50"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <GripVertical className="h-3.5 w-3.5" />
                        <button
                          onClick={() =>
                            handleMoveSection(index, "down")
                          }
                          disabled={index === sections.length - 1}
                          className="rounded p-0.5 hover:text-muted-foreground disabled:opacity-30 disabled:hover:text-muted-foreground/50"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Number Badge */}
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {index + 1}
                      </div>

                      {/* Content */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {section.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {section.totalPages} pages
                          <span className="mx-1.5">·</span>
                          {section.language === "chinese"
                            ? "中文"
                            : "English"}
                        </p>
                      </div>

                      {/* Delete Button */}
                      <button
                        onClick={() => handleDeleteSection(section.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ======== Add Section Modal ======== */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
            <DialogDescription>
              Generate course content with AI. Provide a section name and prompt to
              create slides.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Section Name */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Section Name <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {sectionName.length}/{MAX_TITLE_LENGTH}
                </span>
              </div>
              <Input
                placeholder="e.g., Introduction to Machine Learning"
                value={sectionName}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_TITLE_LENGTH) {
                    setSectionName(e.target.value);
                  }
                }}
                className="h-10"
              />
            </div>

            {/* Course Prompt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  Course Prompt <span className="text-destructive">*</span>
                </Label>
                <span className="text-xs text-muted-foreground">
                  {sectionPrompt.length}/{MAX_DESC_LENGTH}
                </span>
              </div>
              <Textarea
                placeholder="Prompt anything you want to generate..."
                value={sectionPrompt}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_DESC_LENGTH) {
                    setSectionPrompt(e.target.value);
                  }
                }}
                rows={5}
                className="resize-none"
              />
            </div>

            {/* PDF Courseware Upload */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">PDF Courseware</Label>
              <button
                type="button"
                onClick={handleSectionPdfUpload}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30"
              >
                <FileUp className="h-4 w-4" />
                {sectionPdfName ? (
                  <span className="text-foreground font-medium">
                    {sectionPdfName}
                  </span>
                ) : (
                  "Click to upload PDF courseware (optional)"
                )}
              </button>
              <input
                ref={sectionFileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleSectionFileChange}
              />
            </div>

            {/* Language */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                Generated Content Language
              </Label>
              <RadioGroup
                value={sectionLanguage}
                onValueChange={setSectionLanguage}
                className="flex gap-6"
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
          </div>

          <DialogFooter className="mt-2">
            <Button
              variant="ghost"
              onClick={() => setModalOpen(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleGenerateSection}
              disabled={generating || !sectionName.trim() || !sectionPrompt.trim()}
              className="gap-2"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
