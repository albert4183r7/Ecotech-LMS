"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wand2,
  ListChecks,
  Presentation,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { courseDetailPath } from "@/lib/routes";
import { QuizReviewPanel, type QuizPreview } from "@/components/lms/quiz/quiz-review-panel";

// ============================================
// Lesson preview
//
// The instructor's review screen: the approved outline on the left, the
// generated slide on the right, and the lesson's quiz behind a tab. Everything
// here is pre-publication — this is the last look before students see it.
//
// Clicking any text on a slide selects the content field behind it and offers
// an instruction box. The edit changes that field alone; see
// /api/slides/[id]/edit-field.
// ============================================

interface PreviewSlide {
  id: string;
  title: string;
  htmlBody: string;
  status: string;
  order: number;
  sectionId: string | null;
  editable: boolean;
}

interface PreviewSection {
  id: string;
  title: string;
  summary: string;
  subtopics: string[];
  slideBudget: number;
  order: number;
}

interface PreviewData {
  id: string;
  title: string;
  course: { id: string; title: string; status: string };
  template: { id: string; label: string };
  sections: PreviewSection[];
  slides: PreviewSlide[];
  quiz: QuizPreview | null;
}

interface Selection {
  path: string;
  label: string;
  currentText: string;
  /** Where to anchor the instruction box, in iframe coordinates. */
  x: number;
  y: number;
}

export function LessonPreviewPage() {
  const router = useRouter();
  const { lessonId } = useParams<{ lessonId: string }>();

  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState<"slides" | "quiz">("slides");

  const [selection, setSelection] = useState<Selection | null>(null);
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    if (!lessonId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/preview`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not load this lesson");
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this lesson");
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  const slides = useMemo(() => data?.slides ?? [], [data]);
  const current = slides[index] ?? null;

  /** Slides belonging to a section, so the outline can show its own slides. */
  const slidesOf = useCallback(
    (sectionId: string) => slides.filter((s) => s.sectionId === sectionId),
    [slides],
  );

  // ─── Click-to-edit ────────────────────────────
  // The rendered slide marks each field with data-path, so a click resolves to
  // the content field behind it rather than to a guess about the markup.
  const attachClickHandler = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    const onClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest?.("[data-path]");
      if (!target) return;
      event.preventDefault();
      const path = target.getAttribute("data-path");
      if (!path) return;

      const rect = target.getBoundingClientRect();
      setSelection({
        path,
        label: path,
        currentText: (target.textContent ?? "").trim(),
        x: rect.left,
        y: rect.bottom,
      });
      setInstruction("");

      for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-path]"))) {
        el.style.outline = el === target ? "2px solid #43699F" : "";
        el.style.outlineOffset = el === target ? "3px" : "";
      }
    };

    // Make editable text look editable.
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>("[data-path]"))) {
      el.style.cursor = "pointer";
    }
    doc.addEventListener("click", onClick);
    return () => doc.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    setSelection(null);
    const iframe = iframeRef.current;
    if (!iframe) return;
    const timer = setTimeout(attachClickHandler, 150);
    return () => clearTimeout(timer);
  }, [current?.htmlBody, attachClickHandler]);

  const applyEdit = useCallback(async () => {
    if (!current || !selection || !instruction.trim() || editing) return;
    setEditing(true);
    try {
      const res = await fetch(`/api/slides/${current.id}/edit-field`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: selection.path, instruction: instruction.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "The edit could not be applied.");
        return;
      }
      setData((prev) =>
        prev
          ? {
              ...prev,
              slides: prev.slides.map((s) =>
                s.id === current.id
                  ? { ...s, htmlBody: json.data.htmlBody, title: json.data.title }
                  : s,
              ),
            }
          : prev,
      );
      toast.success(`Updated the ${json.data.label}.`);
      setSelection(null);
      setInstruction("");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setEditing(false);
    }
  }, [current, selection, instruction, editing]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="text-muted-foreground mx-auto h-8 w-8" />
        <p className="text-muted-foreground mt-3 text-sm">{error ?? "Lesson not found."}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          Go back
        </Button>
      </div>
    );
  }

  const readyCount = slides.filter((s) => s.status === "READY").length;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6">
      {/* ─── Header ─────────────────────────────── */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-foreground truncate text-xl font-bold">{data.title}</h1>
          <p className="text-muted-foreground truncate text-sm">
            {data.course.title} · {data.template.label} template
          </p>
        </div>
        <Badge variant={data.course.status === "published" ? "default" : "secondary"}>
          {data.course.status === "published" ? "Published" : "Draft — not yet visible"}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(courseDetailPath(data.course.id))}
        >
          Open course
        </Button>
      </div>

      {/* ─── Tabs ───────────────────────────────── */}
      <div className="mb-4 flex gap-1">
        <Button
          variant={tab === "slides" ? "secondary" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setTab("slides")}
        >
          <Presentation className="h-4 w-4" />
          Slides
          <Badge variant="outline" className="ml-1">
            {readyCount}
          </Badge>
        </Button>
        <Button
          variant={tab === "quiz" ? "secondary" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setTab("quiz")}
        >
          <ListChecks className="h-4 w-4" />
          Quiz
          {data.quiz?.status === "READY" ? (
            <Badge variant="outline" className="ml-1">
              {data.quiz.questions.length}
            </Badge>
          ) : (
            <AlertTriangle className="ml-1 h-3.5 w-3.5 text-amber-500" />
          )}
        </Button>
      </div>

      {tab === "quiz" ? (
        <QuizReviewPanel lessonId={data.id} quiz={data.quiz} onChanged={load} />
      ) : (
        /* ─── Outline | Slide ─────────────────── */
        <div className="grid gap-5 lg:grid-cols-[minmax(260px,340px)_1fr]">
          {/* Outline */}
          <aside className="bg-card rounded-xl border">
            <div className="border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Outline</h2>
              <p className="text-muted-foreground text-xs">
                {data.sections.length} section{data.sections.length === 1 ? "" : "s"} ·{" "}
                {slides.length} slide{slides.length === 1 ? "" : "s"}
              </p>
            </div>
            <ScrollArea className="h-[calc(100vh-19rem)]">
              <div className="space-y-4 p-3">
                {data.sections.map((section) => (
                  <div key={section.id}>
                    <p className="text-foreground px-1 text-sm font-semibold">{section.title}</p>
                    {section.subtopics.length > 0 && (
                      <ul className="text-muted-foreground mt-1 space-y-0.5 px-1 text-xs">
                        {section.subtopics.map((topic, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="text-primary/50">•</span>
                            <span>{topic}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 space-y-1">
                      {slidesOf(section.id).map((slide) => {
                        const position = slides.findIndex((s) => s.id === slide.id);
                        const active = position === index;
                        return (
                          <button
                            key={slide.id}
                            onClick={() => setIndex(position)}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                              active
                                ? "bg-primary/10 text-primary font-medium"
                                : "hover:bg-accent/50 text-muted-foreground"
                            }`}
                          >
                            <span className="bg-muted flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold">
                              {position + 1}
                            </span>
                            <span className="truncate">{slide.title}</span>
                            {slide.status === "READY" ? (
                              <CheckCircle2 className="ml-auto h-3 w-3 shrink-0 text-emerald-500" />
                            ) : (
                              <AlertTriangle className="ml-auto h-3 w-3 shrink-0 text-amber-500" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </aside>

          {/* Slide */}
          <section className="space-y-3">
            <div className="bg-card relative overflow-hidden rounded-xl border shadow-sm">
              {current ? (
                <iframe
                  ref={iframeRef}
                  srcDoc={current.htmlBody}
                  sandbox="allow-same-origin allow-scripts"
                  className="w-full border-0"
                  style={{ aspectRatio: "16 / 9" }}
                  title={`Preview of ${current.title}`}
                  onLoad={attachClickHandler}
                />
              ) : (
                <div className="text-muted-foreground flex aspect-video items-center justify-center text-sm">
                  This lesson has no slides yet.
                </div>
              )}
            </div>

            {/* Inline edit */}
            {selection ? (
              <div className="bg-card space-y-2 rounded-xl border p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <Wand2 className="text-primary h-4 w-4 shrink-0" />
                  <p className="text-sm font-medium">Edit this {selection.path.split(".").pop()}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 text-xs"
                    onClick={() => setSelection(null)}
                  >
                    Cancel
                  </Button>
                </div>
                <p className="text-muted-foreground bg-muted/50 rounded px-2 py-1.5 text-xs italic">
                  “{selection.currentText.slice(0, 160)}
                  {selection.currentText.length > 160 ? "…" : ""}”
                </p>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyEdit()}
                    placeholder="e.g. Make this more concise"
                    disabled={editing}
                  />
                  <Button onClick={applyEdit} disabled={editing || !instruction.trim()}>
                    {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Only this field changes. The layout, template and every other element stay as they
                  are.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-center text-xs">
                {current?.editable
                  ? "Click any text on the slide to edit it with AI."
                  : "This slide predates field-level editing; regenerate the lesson to edit it."}
              </p>
            )}

            {/* Slide navigation */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-muted-foreground text-sm tabular-nums">
                Slide {slides.length === 0 ? 0 : index + 1} of {slides.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
                disabled={index >= slides.length - 1}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
