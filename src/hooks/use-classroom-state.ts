"use client";

import { useEffect, useState } from "react";
import type { ClassroomState } from "@/types/lms";
import { buildClassroomState } from "@/lib/classroom";

// ============================================
// Classroom state, loaded from a lesson id
//
// The classroom used to receive its whole payload through the navigation
// store, which meant /learn/<id> could only be reached by clicking through the
// app — a refresh or a shared link had nothing to render. Loading from the id
// in the URL is what makes the route real.
// ============================================

export interface ClassroomLoad {
  state: ClassroomState | null;
  /** Id of the slide being shown, needed to persist element edits. */
  slideId: string | null;
  /** Style hint passed to the AI editor so edits stay visually consistent. */
  slideContext: string;
  loading: boolean;
  error: string | null;
}

/** Build the style hint the inline editor sends along with an edit. */
function buildSlideContext(outlineJson: string | null, lessonTitle: string): string {
  if (!outlineJson) return "";
  try {
    const outline = JSON.parse(outlineJson);
    const style = outline.style || "";
    const topic = outline.topic || lessonTitle;
    return `This is a ${style ? style + "-style" : ""} slide about "${topic}". Keep edits visually consistent with this style.`;
  } catch {
    return "";
  }
}

export function useClassroomState(lessonId: string | undefined): ClassroomLoad {
  const [load, setLoad] = useState<ClassroomLoad>({
    state: null,
    slideId: null,
    slideContext: "",
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!lessonId) {
      setLoad({ state: null, slideId: null, slideContext: "", loading: false, error: null });
      return;
    }

    let cancelled = false;

    (async () => {
      setLoad((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const lessonRes = await fetch(`/api/lessons/${lessonId}`);
        const lessonJson = await lessonRes.json();
        // The server answers 404 both for a lesson that does not exist and for
        // one this account may not read, so its message is the one to show.
        if (!lessonRes.ok || !lessonJson.success) {
          throw new Error(lessonJson.error || "Lesson not found");
        }
        const lesson = lessonJson.data;

        const courseRes = await fetch(`/api/courses/${lesson.courseId}`);
        const courseJson = await courseRes.json();
        if (!courseRes.ok || !courseJson.success) {
          throw new Error(courseJson.error || "Course not found");
        }
        const course = courseJson.data;

        const allLessonIds: string[] = (course.lessons ?? []).map((l: { id: string }) => l.id);
        const state = buildClassroomState({
          courseId: lesson.courseId,
          courseTitle: course.title ?? "",
          lessonId: lesson.id,
          lessonTitle: lesson.title ?? "",
          language: lesson.language ?? course.language ?? "english",
          slides: lesson.slides,
          allLessonIds,
        });

        if (cancelled) return;
        setLoad({
          state,
          slideId: state.slides[0]?.id || null,
          slideContext: buildSlideContext(lesson.outlineJson, lesson.title ?? ""),
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setLoad({
          state: null,
          slideId: null,
          slideContext: "",
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load lesson",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  return load;
}
