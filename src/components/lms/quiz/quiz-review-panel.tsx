"use client";

import { useCallback, useState } from "react";
import { Check, Loader2, Pencil, RefreshCw, AlertTriangle, Quote, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ============================================
// Quiz review
//
// What the instructor sees before publishing: every question, every choice,
// which one is correct, the explanation, and the sentence from the lesson the
// question was drawn from — so "is this quiz actually about this lesson?" can
// be answered by reading rather than by trusting.
//
// Editing is in place. Changing a question never regenerates the lesson, or
// even the rest of the quiz.
// ============================================

export interface QuizPreviewOption {
  id: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

export interface QuizPreviewQuestion {
  id: string;
  prompt: string;
  explanation: string | null;
  sourceQuote: string | null;
  order: number;
  options: QuizPreviewOption[];
}

export interface QuizPreview {
  id: string;
  title: string;
  status: string;
  error: string | null;
  questions: QuizPreviewQuestion[];
}

export interface QuizReviewPanelProps {
  lessonId: string;
  quiz: QuizPreview | null;
  /** Called after a change that needs the parent to reload. */
  onChanged: () => void;
}

export function QuizReviewPanel({ lessonId, quiz, onChanged }: QuizReviewPanelProps) {
  const [regenerating, setRegenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<QuizPreviewQuestion | null>(null);
  const [saving, setSaving] = useState(false);

  const regenerate = useCallback(async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/quiz`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Quiz generation failed.");
        return;
      }
      toast.success(`Generated ${json.data.questionCount} question(s).`);
      onChanged();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setRegenerating(false);
    }
  }, [lessonId, regenerating, onChanged]);

  const startEdit = (question: QuizPreviewQuestion) => {
    setEditingId(question.id);
    setDraft(structuredClone(question));
  };

  const save = useCallback(async () => {
    if (!quiz || !draft || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questions: [
            {
              id: draft.id,
              prompt: draft.prompt,
              explanation: draft.explanation,
              options: draft.options.map((o) => ({
                id: o.id,
                text: o.text,
                isCorrect: o.isCorrect,
              })),
            },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Could not save the question.");
        return;
      }
      toast.success("Question updated.");
      setEditingId(null);
      setDraft(null);
      onChanged();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }, [quiz, draft, saving, onChanged]);

  if (!quiz || quiz.status !== "READY") {
    return (
      <div className="bg-card rounded-xl border p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="text-foreground mt-3 font-medium">
          {quiz?.status === "ERROR" ? "The quiz could not be generated" : "No quiz yet"}
        </p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-md text-sm">
          {quiz?.error ??
            "A quiz is normally generated with the lesson. You can generate it here without regenerating the slides."}
        </p>
        <Button className="mt-4 gap-2" onClick={regenerate} disabled={regenerating}>
          {regenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {regenerating ? "Generating…" : "Generate quiz"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-foreground truncate font-semibold">{quiz.title}</h2>
          <p className="text-muted-foreground text-sm">
            {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"}, drawn from
            this lesson only
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={regenerate}
          disabled={regenerating}
        >
          {regenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Regenerate
        </Button>
      </div>

      {quiz.questions.map((question, i) => {
        const isEditing = editingId === question.id && draft;
        const shown = isEditing ? draft : question;

        return (
          <div key={question.id} className="bg-card rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                {isEditing ? (
                  <Input
                    value={shown.prompt}
                    onChange={(e) => setDraft({ ...shown, prompt: e.target.value })}
                    className="font-medium"
                  />
                ) : (
                  <p className="text-foreground font-medium">{shown.prompt}</p>
                )}

                <ul className="space-y-1.5">
                  {shown.options.map((option, n) => (
                    <li key={option.id} className="flex items-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            type="button"
                            variant={option.isCorrect ? "default" : "outline"}
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0"
                            title="Mark as the correct answer"
                            onClick={() =>
                              setDraft({
                                ...shown,
                                options: shown.options.map((o) => ({
                                  ...o,
                                  // Exactly one correct answer; picking one
                                  // clears the rest rather than allowing a
                                  // state the server would reject.
                                  isCorrect: o.id === option.id,
                                })),
                              })
                            }
                          >
                            {option.isCorrect ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <span className="text-xs">{String.fromCharCode(65 + n)}</span>
                            )}
                          </Button>
                          <Input
                            value={option.text}
                            onChange={(e) =>
                              setDraft({
                                ...shown,
                                options: shown.options.map((o) =>
                                  o.id === option.id ? { ...o, text: e.target.value } : o,
                                ),
                              })
                            }
                            className="h-8"
                          />
                        </>
                      ) : (
                        <span
                          className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
                            option.isCorrect
                              ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span className="font-mono text-xs">{String.fromCharCode(65 + n)}.</span>
                          {option.text}
                          {option.isCorrect && <Check className="h-3.5 w-3.5" />}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>

                {isEditing ? (
                  <Textarea
                    value={shown.explanation ?? ""}
                    onChange={(e) => setDraft({ ...shown, explanation: e.target.value || null })}
                    placeholder="Explanation shown after submission (optional)"
                    rows={2}
                  />
                ) : (
                  shown.explanation && (
                    <p className="text-muted-foreground text-sm">{shown.explanation}</p>
                  )
                )}

                {/* The lesson sentence this question was built from. This is
                    what makes grounding checkable rather than asserted. */}
                {shown.sourceQuote && (
                  <p className="text-muted-foreground border-primary/30 flex gap-2 border-l-2 pl-2 text-xs italic">
                    <Quote className="h-3 w-3 shrink-0" />
                    {shown.sourceQuote}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-1">
                {isEditing ? (
                  <>
                    <Button size="sm" className="h-8 gap-1.5" onClick={save} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(null);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => startEdit(question)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <Badge variant="outline" className="text-muted-foreground">
        Students see these questions only after finishing the lesson, and never see which answer is
        correct until they submit.
      </Badge>
    </div>
  );
}
