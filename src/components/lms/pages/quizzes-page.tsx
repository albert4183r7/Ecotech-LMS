"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Loader2, BookOpen, CheckCircle2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { quizAttemptPath, lessonPreviewPath } from "@/lib/routes";

// ============================================
// Quizzes
//
// What the signed-in person may take or review. The list comes from the server
// already filtered — a quiz from an unpublished course, or from a course they
// are not enrolled in, is never in the response to begin with, so there is
// nothing here that hiding a card would be protecting.
// ============================================

interface QuizListItem {
  id: string;
  title: string;
  questionCount: number;
  lesson: { id: string; title: string; order: number };
  course: { id: string; title: string; coverImage: string | null };
  isOwner: boolean;
  lastAttempt: {
    id: string;
    score: number;
    correctCount: number;
    totalCount: number;
    submittedAt: string;
  } | null;
}

export function QuizzesPage() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<QuizListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/quizzes");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not load quizzes");
      setQuizzes(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load quizzes");
      setQuizzes([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Grouped by course, since that is how a learner thinks about them. */
  const byCourse = useMemo(() => {
    const groups = new Map<string, { title: string; items: QuizListItem[] }>();
    for (const quiz of quizzes ?? []) {
      const group = groups.get(quiz.course.id) ?? { title: quiz.course.title, items: [] };
      group.items.push(quiz);
      groups.set(quiz.course.id, group);
    }
    return [...groups.entries()];
  }, [quizzes]);

  if (quizzes === null) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-foreground flex items-center gap-2 text-2xl font-bold">
          <ListChecks className="text-primary h-6 w-6" />
          Quizzes
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          One quiz per lesson, from the courses you are enrolled in.
        </p>
      </div>

      {error && <p className="text-destructive mb-4 text-sm">{error}</p>}

      {quizzes.length === 0 ? (
        <div className="bg-card rounded-xl border p-10 text-center">
          <BookOpen className="text-muted-foreground/40 mx-auto h-10 w-10" />
          <p className="text-foreground mt-3 font-medium">No quizzes yet</p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
            Quizzes appear once you are enrolled in a published course whose lessons have been
            generated.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => router.push("/courses")}>
            Browse courses
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {byCourse.map(([courseId, group]) => (
            <section key={courseId}>
              <h2 className="text-muted-foreground mb-2 text-sm font-semibold">{group.title}</h2>
              <div className="space-y-2">
                {group.items.map((quiz) => (
                  <div
                    key={quiz.id}
                    className="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate font-medium">{quiz.title}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        Lesson {quiz.lesson.order + 1}: {quiz.lesson.title} · {quiz.questionCount}{" "}
                        question{quiz.questionCount === 1 ? "" : "s"}
                      </p>
                    </div>

                    {quiz.lastAttempt && (
                      <Badge
                        variant="outline"
                        className={
                          quiz.lastAttempt.score >= 70
                            ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                            : ""
                        }
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        {quiz.lastAttempt.score}%
                      </Badge>
                    )}

                    {quiz.isOwner ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => router.push(lessonPreviewPath(quiz.lesson.id))}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Review
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => router.push(quizAttemptPath(quiz.id))}>
                        {quiz.lastAttempt ? "Retake" : "Start quiz"}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
