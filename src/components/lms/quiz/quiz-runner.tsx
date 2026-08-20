"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Trophy, ArrowRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// ============================================
// Taking a quiz
//
// The learner answers, submits once, and immediately sees what they got right,
// what they got wrong, and the correct answer for anything they missed.
// Nothing is graded by hand and nothing waits for an instructor.
//
// Correct answers are not present in the data this component receives until
// submission returns them, so they cannot be read out of the page beforehand.
// ============================================

export interface RunnerOption {
  id: string;
  text: string;
  order: number;
}

export interface RunnerQuestion {
  id: string;
  prompt: string;
  order: number;
  imageUrl: string | null;
  options: RunnerOption[];
}

export interface RunnerQuiz {
  id: string;
  title: string;
  questions: RunnerQuestion[];
}

interface QuestionResult {
  questionId: string;
  prompt: string;
  explanation: string | null;
  isCorrect: boolean;
  selectedOptionId: string | null;
  correctOptionId: string | null;
  options: { id: string; text: string; order: number; isCorrect: boolean }[];
}

interface AttemptResult {
  attemptId: string;
  score: number;
  correctCount: number;
  totalCount: number;
  results: QuestionResult[];
}

export interface QuizRunnerProps {
  quiz: RunnerQuiz;
  /** Shown once the result is on screen, to move the learner onward. */
  onContinue?: () => void;
  continueLabel?: string;
}

export function QuizRunner({ quiz, onContinue, continueLabel = "Continue" }: QuizRunnerProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);

  const answeredCount = Object.keys(answers).length;
  const total = quiz.questions.length;
  const allAnswered = answeredCount === total;

  const submit = useCallback(async () => {
    if (submitting || result) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Could not submit the quiz.");
        return;
      }
      setResult(json.data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [quiz.id, answers, submitting, result]);

  const retry = () => {
    setAnswers({});
    setResult(null);
  };

  const resultsById = useMemo(
    () => new Map((result?.results ?? []).map((r) => [r.questionId, r])),
    [result],
  );

  return (
    <div className="space-y-5">
      {/* ─── Score, once submitted ─────────────── */}
      {result && (
        <div className="bg-card rounded-xl border p-6 text-center">
          <Trophy
            className={`mx-auto h-10 w-10 ${
              result.score >= 70 ? "text-amber-500" : "text-muted-foreground"
            }`}
          />
          <p className="text-foreground mt-3 text-3xl font-bold tabular-nums">{result.score}%</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {result.correctCount} of {result.totalCount} correct
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={retry}>
              <RotateCcw className="h-4 w-4" />
              Try again
            </Button>
            {onContinue && (
              <Button size="sm" className="gap-1.5" onClick={onContinue}>
                {continueLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ─── Progress, while answering ─────────── */}
      {!result && (
        <div className="space-y-1.5">
          <div className="text-muted-foreground flex justify-between text-xs">
            <span>{quiz.title}</span>
            <span className="tabular-nums">
              {answeredCount} of {total} answered
            </span>
          </div>
          <Progress value={(answeredCount / Math.max(1, total)) * 100} className="h-1.5" />
        </div>
      )}

      {/* ─── Questions ─────────────────────────── */}
      {quiz.questions.map((question, i) => {
        const outcome = resultsById.get(question.id);
        // Before submission the options carry no correctness; afterwards the
        // server's result does. One shape covers both so the render path is
        // identical either way.
        const options: { id: string; text: string; order: number; isCorrect?: boolean }[] =
          outcome?.options ?? question.options;

        return (
          <div
            key={question.id}
            className={`bg-card rounded-xl border p-4 ${
              outcome
                ? outcome.isCorrect
                  ? "border-emerald-300 dark:border-emerald-800/60"
                  : "border-rose-300 dark:border-rose-800/60"
                : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-start gap-2">
                  <p className="text-foreground flex-1 font-medium">{question.prompt}</p>
                  {outcome &&
                    (outcome.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 shrink-0 text-rose-500" />
                    ))}
                </div>

                {question.imageUrl && (
                  <img
                    src={question.imageUrl}
                    alt=""
                    className="max-h-56 rounded-lg border object-contain"
                  />
                )}

                <div className="space-y-1.5">
                  {options.map((option, n) => {
                    const chosen = outcome
                      ? outcome.selectedOptionId === option.id
                      : answers[question.id] === option.id;
                    const isRight = Boolean(outcome && option.isCorrect);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={Boolean(result)}
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [question.id]: option.id }))
                        }
                        className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                          isRight
                            ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                            : chosen && outcome
                              ? "border-rose-400 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                              : chosen
                                ? "border-primary bg-primary/5"
                                : "hover:bg-accent/40"
                        } ${result ? "cursor-default" : ""}`}
                      >
                        <span className="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded font-mono text-xs">
                          {String.fromCharCode(65 + n)}
                        </span>
                        <span className="flex-1">{option.text}</span>
                        {/* Both are labelled explicitly: which one was picked,
                            and which one was right. */}
                        {chosen && (
                          <span className="text-muted-foreground shrink-0 text-xs">
                            Your answer
                          </span>
                        )}
                        {isRight && !chosen && (
                          <span className="shrink-0 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                            Correct answer
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {outcome && !outcome.isCorrect && outcome.correctOptionId && (
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Correct answer:{" "}
                    {options.find((o) => o.id === outcome.correctOptionId)?.text ?? "—"}
                  </p>
                )}
                {outcome?.explanation && (
                  <p className="text-muted-foreground text-sm">{outcome.explanation}</p>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* ─── Submit ────────────────────────────── */}
      {!result && (
        <div className="flex items-center justify-end gap-3">
          {!allAnswered && (
            <p className="text-muted-foreground text-xs">
              {total - answeredCount} question{total - answeredCount === 1 ? "" : "s"} left
            </p>
          )}
          <Button onClick={submit} disabled={submitting || !allAnswered} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit quiz
          </Button>
        </div>
      )}
    </div>
  );
}
