"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BrainCircuit, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MasterySprint, type SprintCourse } from "@/components/lms/mastery-sprint";

interface EnrollmentResponse {
  progress: number;
  course: {
    id: string;
    title: string;
    lessonsCount: number;
  };
}

export function MasterySprintPage() {
  const [courses, setCourses] = useState<SprintCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/enrollments");
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Could not load your enrolled courses.");
        }
        const enrollments = json.data as EnrollmentResponse[];
        if (active) {
          setCourses(
            enrollments
              .map((enrollment) => ({
                id: enrollment.course.id,
                title: enrollment.course.title,
                progress: enrollment.progress,
                lessonsCount: enrollment.course.lessonsCount,
              }))
              .sort((a, b) => a.title.localeCompare(b.title)),
          );
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Could not load courses.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 gap-2">
        <Link href="/my-learning">
          <ArrowLeft className="h-4 w-4" /> My learning
        </Link>
      </Button>

      <header className="mb-6 flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
          <BrainCircuit className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-foreground text-2xl font-bold tracking-tight">Mastery Sprint</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
            Build an adaptive practice session from one or several enrolled courses. Every question
            stays grounded in its source lesson while topics rotate throughout the sprint.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="text-muted-foreground flex min-h-72 items-center justify-center text-sm">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading your courses…
        </div>
      ) : error ? (
        <div className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : (
        <MasterySprint courses={courses} />
      )}
    </div>
  );
}
