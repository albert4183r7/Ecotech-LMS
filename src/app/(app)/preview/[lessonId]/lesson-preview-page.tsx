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
  FileDown,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { courseDetailPath, lessonPreviewPath } from "@/lib/routes";
import { usePptxDownload } from "@/hooks/use-pptx-download";
import { QuizReviewPanel, type QuizPreview } from "@/components/lms/quiz/quiz-review-panel";

// ============================================
// Lesson preview
//
// The instructor's review screen: the approved outline on the left, the
// generated slide on the right, and the lesson's quiz behind a tab. Everything
// here is pre-publication — this is the last look before students see it.
//
// It walks the same path a student does — lesson, then its quiz, then the next
// lesson — because a review that cannot follow the route the class takes
// cannot tell whether that route works. What differs is the purpose: a student
// answers the quiz, an instructor reads and edits it.
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

/** One lesson of the course, for stepping from this one to the next. */
interface CourseLesson {
  id: string;
  title: string;
  order: number;
}

interface PreviewData {
  id: string;
  title: string;
  course: { id: string; title: string; status: string };
  lessons: CourseLesson[];
  template: { id: string; label: string };
  sections: PreviewSection[];
  slides: PreviewSlide[];
  quiz: QuizPreview | null;
}

/** What /api/lessons/[id]/progress reports while a lesson is being written. */
interface LessonProgress {
  stage: "slides" | "finishing" | "ready" | "failed";
  done: boolean;
  totalSlides: number;
  readySlides: number;
  errorSlides: number;
}

interface Selection {
  path: string;
  label: string;
  currentText: string;
  /** Where to anchor the instruction box, in iframe coordinates. */
  x: number;
  y: number;
}

/** Which lesson the slide index and the open tab belong to.
 *
 *  Stepping to the next lesson keeps this component mounted, so a plain index
 *  would carry slide 7 of the last lesson into a lesson with three slides.
 *  Naming the lesson the view belongs to resets it without an effect. */
interface ViewState {
  lessonId: string;
  index: number;
  tab: "slides" | "quiz";
}

/** How often the page re-checks a lesson that is still being generated. */
const PROGRESS_POLL_MS = 3000;

export function LessonPreviewPage() {
  const router = useRouter();
  const { lessonId } = useParams<{ lessonId: string }>();

  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LessonProgress | null>(null);

  const [view, setView] = useState<ViewState>({ lessonId: "", index: 0, tab: "slides" });
  const active: ViewState =
    view.lessonId === lessonId ? view : { lessonId, index: 0, tab: "slides" };
  const index = active.index;
  const tab = active.tab;
  const setIndex = useCallback(
    (next: number | ((current: number) => number)) =>
      setView((prev) => {
        const base =
          prev.lessonId === lessonId ? prev : { lessonId, index: 0, tab: "slides" as const };
        return { ...base, index: typeof next === "function" ? next(base.index) : next };
      }),
    [lessonId],
  );
  const setTab = useCallback(
    (next: "slides" | "quiz") =>
      setView((prev) => {
        const base =
          prev.lessonId === lessonId ? prev : { lessonId, index: 0, tab: "slides" as const };
        return { ...base, tab: next };
      }),
    [lessonId],
  );

  const [selection, setSelection] = useState<Selection | null>(null);
  const [instruction, setInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { downloadingLessonId, downloadLesson } = usePptxDownload();

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

  // ─── "Is it still being written?" ─────────────
  //
  // Opening the preview straight after generation used to show whatever
  // existed at that instant and never change again, so a deck the server was
  // still reviewing looked finished — or half-empty — with nothing on screen
  // to say otherwise. The statuses are cheap to read, so the page keeps asking
  // until the workflow reports itself done, then reloads the lesson.
  const wasDoneRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    wasDoneRef.current = null;

    const check = async () => {
      try {
        const res = await fetch(`/api/lessons/${lessonId}/progress`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json.success) return;
        const next = json.data as LessonProgress;
        // The review pass rewrites slides, and the quiz only exists once the
        // workflow ends, so the lesson is read again the moment it finishes.
        if (wasDoneRef.current === false && next.done) void load();
        wasDoneRef.current = next.done;
        setProgress(next);
        if (next.done && timer) {
          clearInterval(timer);
          timer = null;
        }
      } catch {
        // A failed check just means the banner does not update this time.
      }
    };

    void check();
    timer = setInterval(check, PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [lessonId, load]);

  const slides = useMemo(() => data?.slides ?? [], [data]);
  const current = slides[Math.min(index, Math.max(0, slides.length - 1))] ?? null;

  // Where this lesson sits in its course, and what comes after it.
  const lessonPosition = data ? data.lessons.findIndex((l) => l.id === data.id) : -1;
  const nextLesson =
    data && lessonPosition >= 0 ? (data.lessons[lessonPosition + 1] ?? null) : null;

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

  /** Move to the next lesson's review, starting at its first slide. */
  const goToNextLesson = useCallback(() => {
    if (!nextLesson) return;
    router.push(lessonPreviewPath(nextLesson.id));
  }, [nextLesson, router]);

  if (loading && !data) {
    // A deck of a dozen slides is a large document to read, so say what is
    // being waited for rather than showing an unexplained spinner.
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
        <p className="text-foreground text-sm font-medium">Loading this lesson…</p>
        <p className="text-muted-foreground text-xs">
          Fetching the generated slides and their quiz.
        </p>
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
  const generating = Boolean(progress && !progress.done);
  const quizReady = data.quiz?.status === "READY";
  // While the lesson is still being written, an absent quiz means "not yet",
  // not "generate one" — the workflow is already doing exactly that.
  const quizPending = generating && !quizReady;

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
            {lessonPosition >= 0 && (
              <>
                {" "}
                · Lesson {lessonPosition + 1} of {data.lessons.length}
              </>
            )}
          </p>
        </div>
        <Badge variant={data.course.status === "published" ? "default" : "secondary"}>
          {data.course.status === "published" ? "Published" : "Draft — not yet visible"}
        </Badge>
        {/* This lesson's own deck. Each lesson exports to its own file, so a
            reviewer downloads the one they are looking at. */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() =>
            downloadLesson(
              { id: data.id, title: data.title },
              { position: lessonPosition >= 0 ? lessonPosition + 1 : undefined },
            )
          }
          disabled={downloadingLessonId !== null || readyCount === 0}
          title={`Download “${data.title}” as a PowerPoint file`}
        >
          {downloadingLessonId === data.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="h-4 w-4" />
          )}
          Download PPT
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(courseDetailPath(data.course.id))}
        >
          Open course
        </Button>
      </div>

      {/* ─── Still generating ───────────────────── */}
      {generating && progress && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <div className="min-w-0">
            <p className="font-medium">
              {progress.stage === "slides"
                ? `Writing the slides — ${progress.readySlides + progress.errorSlides} of ${progress.totalSlides} done`
                : `All ${progress.totalSlides} slides are written. Reviewing them and building the quiz…`}
            </p>
            <p className="mt-0.5 text-xs">
              You can read and edit whatever is already here. This page updates itself as the rest
              arrives — there is no need to refresh.
            </p>
          </div>
        </div>
      )}

      {/* ─── The review path: slides, then quiz, then the next lesson ─── */}
      <div className="mb-4 flex flex-wrap items-center gap-1">
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
        <ChevronRight className="text-muted-foreground/50 h-4 w-4" />
        <Button
          variant={tab === "quiz" ? "secondary" : "ghost"}
          size="sm"
          className="gap-2"
          onClick={() => setTab("quiz")}
        >
          <ListChecks className="h-4 w-4" />
          Quiz
          {quizReady ? (
            <Badge variant="outline" className="ml-1">
              {data.quiz?.questions.length}
            </Badge>
          ) : quizPending ? (
            <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <AlertTriangle className="ml-1 h-3.5 w-3.5 text-amber-500" />
          )}
        </Button>
        {nextLesson && (
          <>
            <ChevronRight className="text-muted-foreground/50 h-4 w-4" />
            <Button variant="ghost" size="sm" className="gap-2" onClick={goToNextLesson}>
              <BookOpen className="h-4 w-4" />
              <span className="max-w-[16rem] truncate">Next lesson</span>
            </Button>
          </>
        )}
      </div>

      {tab === "quiz" ? (
        <div className="space-y-4">
          {quizPending ? (
            <div className="bg-card rounded-xl border p-8 text-center">
              <Loader2 className="text-primary mx-auto h-8 w-8 animate-spin" />
              <p className="text-foreground mt-3 font-medium">The quiz is being written</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
                It is drawn from the finished slides, so it is the last part of the lesson to
                arrive. It appears here on its own — nothing to press.
              </p>
            </div>
          ) : (
            <QuizReviewPanel lessonId={data.id} quiz={data.quiz} onChanged={load} />
          )}

          {/* Lesson → quiz → next lesson, the same order the class takes it in. */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setTab("slides");
                setIndex(Math.max(0, slides.length - 1));
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              Back to slides
            </Button>
            {nextLesson ? (
              <Button size="sm" className="gap-1.5" onClick={goToNextLesson}>
                <span className="max-w-[18rem] truncate">Next lesson: {nextLesson.title}</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => router.push(courseDetailPath(data.course.id))}
              >
                <CheckCircle2 className="h-4 w-4" />
                Finish review
              </Button>
            )}
          </div>
        </div>
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
                        const isActive = position === index;
                        return (
                          <button
                            key={slide.id}
                            onClick={() => setIndex(position)}
                            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                              isActive
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
                  // Click-to-edit reads the frame's document to find which
                  // field was clicked, which needs same-origin. The document
                  // itself arrives sanitized from the preview endpoint.
                  sandbox="allow-same-origin allow-scripts"
                  className="w-full border-0"
                  style={{ aspectRatio: "16 / 9" }}
                  title={`Preview of ${current.title}`}
                  onLoad={attachClickHandler}
                />
              ) : (
                <div className="text-muted-foreground flex aspect-video flex-col items-center justify-center gap-2 text-sm">
                  {generating ? (
                    <>
                      <Loader2 className="text-primary h-6 w-6 animate-spin" />
                      The first slide is still being written…
                    </>
                  ) : (
                    "This lesson has no slides yet."
                  )}
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

            {/* Slide navigation.
                The last slide leads to the quiz rather than to a dead end: the
                quiz is part of the lesson, and reviewing one without the other
                is how a lesson ships with a quiz nobody read. */}
            <div className="flex items-center justify-between gap-2">
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
              {index >= slides.length - 1 ? (
                <Button size="sm" className="gap-1.5" onClick={() => setTab("quiz")}>
                  <ListChecks className="h-4 w-4" />
                  Continue to quiz
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setIndex((i) => Math.min(slides.length - 1, i + 1))}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
