"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuizRunner, type RunnerQuiz } from "@/components/lms/quiz/quiz-runner";
import { classroomPath, courseDetailPath, ROUTES } from "@/lib/routes";

// ============================================
// Taking one quiz
//
// Reached after finishing a lesson, or from the Quizzes page. Access is
// decided by the API — an unenrolled or unpublished course's quiz returns
// not-found, so there is nothing to guard here beyond showing the answer.
// ============================================

interface QuizPayload extends RunnerQuiz {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  status: string;
  canEdit: boolean;
}

export function QuizAttemptPage() {
  const router = useRouter();
  const { quizId } = useParams<{ quizId: string }>();
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextLessonId, setNextLessonId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!quizId) return;
    try {
      // The quiz endpoint is addressed by lesson; find this quiz's lesson via
      // the list the caller is entitled to see.
      const listRes = await fetch("/api/quizzes");
      const listJson = await listRes.json();
      const entry = (listJson.data ?? []).find((q: { id: string }) => q.id === quizId);
      if (!entry) throw new Error("This quiz is not available to you.");

      const res = await fetch(`/api/lessons/${entry.lesson.id}/quiz`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Could not load this quiz");
      setQuiz(json.data);

      // Where "continue" should go once the result is on screen.
      const courseRes = await fetch(`/api/courses/${json.data.courseId}`);
      const courseJson = await courseRes.json();
      const lessons: { id: string }[] = courseJson?.data?.lessons ?? [];
      const position = lessons.findIndex((l) => l.id === json.data.lessonId);
      setNextLessonId(position >= 0 ? (lessons[position + 1]?.id ?? null) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this quiz");
    }
  }, [quizId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <main className="mx-auto max-w-md py-16 text-center">
        <AlertTriangle className="text-muted-foreground mx-auto h-8 w-8" />
        <p className="text-muted-foreground mt-3 text-sm">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(ROUTES.quizzes)}>
          Back to quizzes
        </Button>
      </main>
    );
  }

  if (!quiz) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="min-w-0">
          <h1 className="text-foreground truncate text-lg font-bold">{quiz.title}</h1>
          <p className="text-muted-foreground truncate text-xs">{quiz.lessonTitle}</p>
        </div>
      </div>

      <QuizRunner
        quiz={quiz}
        continueLabel={nextLessonId ? "Next lesson" : "Back to course"}
        onContinue={() =>
          router.push(nextLessonId ? classroomPath(nextLessonId) : courseDetailPath(quiz.courseId))
        }
      />
    </main>
  );
}
