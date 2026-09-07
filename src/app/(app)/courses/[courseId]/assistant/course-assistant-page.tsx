"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Bot, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseAssistant } from "@/components/lms/course-assistant";

interface CourseSummary {
  id: string;
  title: string;
  lessons: { id: string }[];
  isOwner?: boolean;
  isEnrolled?: boolean;
}

export function CourseAssistantPage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const [course, setCourse] = useState<CourseSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/courses/${courseId}`);
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || "Could not load this course.");
        }
        if (active) setCourse(json.data);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load course.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [courseId]);

  if (loading) {
    return (
      <div className="text-muted-foreground flex min-h-[60vh] items-center justify-center text-sm">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading course knowledge base…
      </div>
    );
  }

  if (error || !course || (!course.isOwner && !course.isEnrolled)) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <Bot className="text-muted-foreground/40 h-9 w-9" />
        <h1 className="text-foreground mt-3 text-lg font-semibold">Knowledge base unavailable</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {error ?? "Enroll in this course, or open one you manage, to use its AI workspace."}
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href={`/courses/${courseId}`}>Back to course</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 gap-2">
        <Link href={`/courses/${course.id}`}>
          <ArrowLeft className="h-4 w-4" /> Back to course
        </Link>
      </Button>

      <header className="mb-5">
        <p className="text-xs font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
          Course knowledge base
        </p>
        <h1 className="text-foreground mt-1 text-2xl font-bold tracking-tight">{course.title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A focused workspace grounded only in this course&apos;s published lesson content.
        </p>
      </header>

      <CourseAssistant
        courseId={course.id}
        courseTitle={course.title}
        lessonCount={course.lessons.length}
        workspace
      />
    </div>
  );
}
