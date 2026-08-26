"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Plus,
  Quote,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { OPTIONS_PER_QUESTION } from "@/lib/quiz/schema";
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

/** A question the instructor is writing, before it has ids of its own. */
interface NewQuestion {
  prompt: string;
  explanation?: string;
  options: { text: string; isCorrect: boolean }[];
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
  /** The question being written by hand, when the instructor is writing one. */
  const [adding, setAdding] = useState<NewQuestion | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

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
      // A shortfall is said out loud. The generator drops a question the
      // lesson cannot support, so asking for ten and getting six is a fact
      // about the lesson — but silently returning six looked like a bug.
      const made = json.data.questionCount as number;
      const asked = json.data.requested as number | undefined;
      const why = (json.data.droppedReasons as string[] | undefined)?.[0];
      if (asked && made < asked) {
        toast.warning(
          `${made} of the ${asked} questions you asked for could be grounded in this lesson.` +
            (why ? ` The rest were dropped: ${why}.` : "") +
            ` Add your own below, or give the lesson more to quiz on.`,
        );
      } else {
        toast.success(`Generated ${made} question(s).`);
      }
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
    setAdding(null);
  };

  /** An empty question, with the four choices a quiz here always has. */
  const blankQuestion = (): NewQuestion => ({
    prompt: "",
    explanation: "",
    options: Array.from({ length: OPTIONS_PER_QUESTION }, (_, i) => ({
      text: "",
      isCorrect: i === 0,
    })),
  });

  const addQuestion = useCallback(async () => {
    if (!quiz || !adding || savingNew) return;

    const prompt = adding.prompt.trim();
    const options = adding.options.map((o) => ({ ...o, text: o.text.trim() }));
    // Checked here as well as on the server, so a half-written question says
    // what is missing instead of coming back as a validation error.
    if (prompt.length < 10) {
      toast.error("Write the question first — at least a sentence.");
      return;
    }
    const filled = options.filter((o) => o.text);
    if (filled.length < 2) {
      toast.error("A question needs at least two answer choices.");
      return;
    }
    if (!filled.some((o) => o.isCorrect)) {
      toast.error("Mark which choice is the correct answer.");
      return;
    }

    setSavingNew(true);
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          explanation: adding.explanation?.trim() || undefined,
          options: filled,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "Could not add the question.");
        return;
      }
      toast.success("Question added.");
      setAdding(null);
      onChanged();
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSavingNew(false);
    }
  }, [quiz, adding, savingNew, onChanged]);

  const removeQuestion = useCallback(
    async (questionId: string) => {
      if (!quiz || removingId) return;
      setRemovingId(questionId);
      try {
        const res = await fetch(`/api/quizzes/${quiz.id}/questions/${questionId}`, {
          method: "DELETE",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          toast.error(json.error || "Could not remove the question.");
          return;
        }
        toast.success("Question removed.");
        onChanged();
      } catch {
        toast.error("Network error. Please try again.");
      } finally {
        setRemovingId(null);
      }
    },
    [quiz, removingId, onChanged],
  );

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
          onClick={() => {
            setEditingId(null);
            setDraft(null);
            setAdding(blankQuestion());
          }}
          disabled={regenerating || adding !== null}
        >
          <Plus className="h-4 w-4" />
          Add question
        </Button>
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
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Edit this question"
                      onClick={() => startEdit(question)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                      aria-label="Remove this question"
                      disabled={removingId === question.id || quiz.questions.length <= 1}
                      onClick={() => void removeQuestion(question.id)}
                    >
                      {removingId === question.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* ---- A question written by hand ---- */}
      {adding && (
        <div className="bg-card border-primary/40 rounded-xl border-2 border-dashed p-4">
          <div className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
              <Plus className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-3">
              <Input
                value={adding.prompt}
                onChange={(e) => setAdding({ ...adding, prompt: e.target.value })}
                placeholder="Your question"
                className="font-medium"
                autoFocus
              />

              <ul className="space-y-1.5">
                {adding.options.map((option, n) => (
                  <li key={n} className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant={option.isCorrect ? "default" : "outline"}
                      size="sm"
                      className="h-7 w-7 shrink-0 p-0"
                      title="Mark as the correct answer"
                      onClick={() =>
                        setAdding({
                          ...adding,
                          options: adding.options.map((o, i) => ({ ...o, isCorrect: i === n })),
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
                        setAdding({
                          ...adding,
                          options: adding.options.map((o, i) =>
                            i === n ? { ...o, text: e.target.value } : o,
                          ),
                        })
                      }
                      placeholder={n < 2 ? `Answer ${String.fromCharCode(65 + n)}` : "Optional"}
                      className="h-8"
                    />
                  </li>
                ))}
              </ul>

              <Textarea
                value={adding.explanation ?? ""}
                onChange={(e) => setAdding({ ...adding, explanation: e.target.value })}
                placeholder="Explanation shown after submission (optional)"
                rows={2}
              />
              <p className="text-muted-foreground text-xs">
                Your own question. It carries no lesson quote, because you wrote it rather than the
                generator.
              </p>
            </div>

            <div className="flex shrink-0 gap-1">
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void addQuestion()}
                disabled={savingNew}
              >
                {savingNew ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                aria-label="Discard this question"
                onClick={() => setAdding(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Badge variant="outline" className="text-muted-foreground">
        Students see these questions only after finishing the lesson, and never see which answer is
        correct until they submit.
      </Badge>
    </div>
  );
}
