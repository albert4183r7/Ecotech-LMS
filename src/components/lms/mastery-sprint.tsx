"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  Check,
  CheckCircle2,
  Layers3,
  Loader2,
  RotateCw,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const MAX_SELECTED_COURSES = 8;

export interface SprintCourse {
  id: string;
  title: string;
  progress: number;
  lessonsCount: number;
}

interface SprintStats {
  answered: number;
  correct: number;
  accuracy: number;
  mastered: number;
  generated: number;
}

interface SprintQuestion {
  id: string;
  prompt: string;
  options: string[];
  topic: string | null;
  courseId: string;
  courseTitle: string;
  isRetry: boolean;
  stats: SprintStats;
}

interface Feedback {
  isCorrect: boolean;
  correctOptionIndex: number;
  explanation: string | null;
  sourceQuote: string | null;
  stats: SprintStats;
}

const EMPTY_STATS: SprintStats = {
  answered: 0,
  correct: 0,
  accuracy: 0,
  mastered: 0,
  generated: 0,
};

export function MasterySprint({ courses }: { courses: SprintCourse[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<SprintStats>(EMPTY_STATS);
  const [question, setQuestion] = useState<SprintQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedCourses = useMemo(
    () => courses.filter((course) => selectedIds.includes(course.id)),
    [courses, selectedIds],
  );

  useEffect(() => {
    if (selectedIds.length === 0) {
      setStats(EMPTY_STATS);
      return;
    }
    const params = new URLSearchParams();
    selectedIds.forEach((id) => params.append("courseId", id));
    void fetch(`/api/mastery-sprint?${params}`)
      .then((response) => response.json())
      .then((json) => json.success && setStats(json.data))
      .catch(() => undefined);
  }, [selectedIds]);

  const toggleCourse = (courseId: string) => {
    setError(null);
    setSelectedIds((current) => {
      if (current.includes(courseId)) return current.filter((id) => id !== courseId);
      if (current.length >= MAX_SELECTED_COURSES) return current;
      return [...current, courseId];
    });
  };

  const next = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setFeedback(null);
    try {
      const response = await fetch("/api/mastery-sprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "next", courseIds: selectedIds }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Could not load practice.");
      setRunning(true);
      setQuestion(json.data);
      setStats(json.data.stats);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load practice.");
    } finally {
      setLoading(false);
    }
  };

  const answer = async () => {
    if (!question || selected === null || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/mastery-sprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          courseIds: selectedIds,
          questionId: question.id,
          selectedOptionIndex: selected,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || "Could not check the answer.");
      }
      setFeedback(json.data);
      setStats(json.data.stats);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not check the answer.");
    } finally {
      setLoading(false);
    }
  };

  const changeCourses = () => {
    setRunning(false);
    setQuestion(null);
    setSelected(null);
    setFeedback(null);
    setError(null);
  };

  return (
    <div className="space-y-5">
      <section className="bg-card overflow-hidden rounded-2xl border shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b p-4 sm:p-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-foreground font-semibold">
                {running ? "Mixed-course sprint" : "Choose your sprint courses"}
              </h2>
              <Badge className="border-0 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300">
                {selectedIds.length} selected
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {running
                ? "Questions rotate across your selected courses and prioritize topics you missed."
                : `Select up to ${MAX_SELECTED_COURSES} enrolled courses. The sprint will mix their lesson topics.`}
            </p>
          </div>
          {running && (
            <Button variant="outline" size="sm" onClick={changeCourses} disabled={loading}>
              Change courses
            </Button>
          )}
        </div>

        {!running && (
          <div className="p-4 sm:p-5">
            {courses.length === 0 ? (
              <div className="py-10 text-center">
                <BookOpen className="text-muted-foreground/40 mx-auto h-8 w-8" />
                <p className="text-foreground mt-2 text-sm font-medium">No enrolled courses yet</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Enroll in a published course before starting a mastery sprint.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    Select one course for focus, or several for interleaved practice.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setSelectedIds(
                          courses.slice(0, MAX_SELECTED_COURSES).map((course) => course.id),
                        )
                      }
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedIds([])}
                      disabled={selectedIds.length === 0}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {courses.map((course) => {
                    const checked = selectedIds.includes(course.id);
                    const disabled = !checked && selectedIds.length >= MAX_SELECTED_COURSES;
                    return (
                      <button
                        key={course.id}
                        type="button"
                        onClick={() => toggleCourse(course.id)}
                        disabled={disabled}
                        aria-pressed={checked}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                          checked
                            ? "border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/10"
                            : "hover:bg-muted/50 hover:border-amber-300",
                          disabled && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                            checked
                              ? "border-amber-500 bg-amber-500 text-white"
                              : "bg-background text-muted-foreground",
                          )}
                        >
                          {checked ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <BookOpen className="h-4 w-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="text-foreground block truncate text-sm font-medium">
                            {course.title}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            {course.lessonsCount} lessons · {course.progress}% complete
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Layers3 className="h-4 w-4" />
                    {selectedIds.length === 0
                      ? "Choose at least one course"
                      : `${selectedIds.length} course${selectedIds.length === 1 ? "" : "s"} will be mixed`}
                  </div>
                  <Button
                    className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
                    onClick={() => void next()}
                    disabled={loading || selectedIds.length === 0}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {loading ? "Building mixed sprint…" : "Start sprint"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {running && question && (
        <section className="via-background dark:via-background overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 to-orange-50 dark:border-amber-900/60 dark:from-amber-950/25 dark:to-orange-950/20">
          <div className="flex flex-wrap items-center gap-4 border-b border-amber-200/60 px-5 py-3 dark:border-amber-900/50">
            <div className="min-w-0 flex-1">
              <Badge variant="outline" className="max-w-full truncate">
                {question.courseTitle}
              </Badge>
              <p className="text-muted-foreground mt-1 truncate text-xs">
                {question.topic || "Course review"}
              </p>
            </div>
            {question.isRetry && (
              <Badge className="gap-1 border-0 bg-violet-500/10 text-violet-700 dark:text-violet-300">
                <RotateCw className="h-3 w-3" /> Worth another look
              </Badge>
            )}
            <div className="flex gap-4 text-center text-xs">
              <div>
                <p className="text-foreground font-bold tabular-nums">{stats.answered}</p>
                <p className="text-muted-foreground text-[10px]">answered</p>
              </div>
              <div>
                <p className="text-foreground font-bold tabular-nums">{stats.accuracy}%</p>
                <p className="text-muted-foreground text-[10px]">accuracy</p>
              </div>
              <div>
                <p className="text-foreground font-bold tabular-nums">{stats.mastered}</p>
                <p className="text-muted-foreground text-[10px]">mastered</p>
              </div>
            </div>
          </div>

          <div className="mx-auto max-w-3xl space-y-4 p-5 sm:p-7">
            <p className="text-foreground text-base leading-relaxed font-semibold sm:text-lg">
              {question.prompt}
            </p>
            <div className="grid gap-2">
              {question.options.map((option, index) => {
                const isCorrect = feedback?.correctOptionIndex === index;
                const isWrongSelection = Boolean(
                  feedback && selected === index && !feedback.isCorrect,
                );
                return (
                  <button
                    key={`${question.id}-${index}`}
                    type="button"
                    disabled={Boolean(feedback)}
                    onClick={() => setSelected(index)}
                    className={cn(
                      "bg-background flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all",
                      selected === index &&
                        !feedback &&
                        "border-amber-500 ring-2 ring-amber-500/15",
                      isCorrect && "border-emerald-500 bg-emerald-500/5",
                      isWrongSelection && "border-rose-500 bg-rose-500/5",
                      !feedback && "hover:border-amber-400 hover:bg-amber-500/5",
                    )}
                  >
                    <span className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="flex-1">{option}</span>
                    {isCorrect && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                    {isWrongSelection && <XCircle className="h-5 w-5 text-rose-500" />}
                  </button>
                );
              })}
            </div>
            {feedback && (
              <div
                className={cn(
                  "rounded-xl border p-3 text-sm",
                  feedback.isCorrect
                    ? "border-emerald-300 bg-emerald-500/5"
                    : "border-rose-300 bg-rose-500/5",
                )}
              >
                <p className="font-semibold">
                  {feedback.isCorrect
                    ? "Correct — concept mastered."
                    : "Not yet — this may return later."}
                </p>
                {feedback.explanation && (
                  <p className="text-muted-foreground mt-1">{feedback.explanation}</p>
                )}
                {feedback.sourceQuote && (
                  <p className="text-muted-foreground mt-2 border-l-2 pl-3 text-xs italic">
                    “{feedback.sourceQuote}”
                  </p>
                )}
              </div>
            )}
            <Progress value={stats.accuracy} className="h-1.5" />
            <div className="flex justify-end">
              {!feedback ? (
                <Button
                  onClick={() => void answer()}
                  disabled={selected === null || loading}
                  className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />} Check answer
                </Button>
              ) : (
                <Button
                  onClick={() => void next()}
                  disabled={loading}
                  className="gap-2 bg-amber-600 text-white hover:bg-amber-700"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="h-4 w-4" />
                  )}{" "}
                  Next challenge
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      {error && (
        <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-center text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      {!running && selectedCourses.length > 1 && (
        <p className="text-muted-foreground text-center text-xs">
          Interleaving {selectedCourses.map((course) => course.title).join(" · ")}
        </p>
      )}
    </div>
  );
}
