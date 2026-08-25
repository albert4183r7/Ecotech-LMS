"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useUserStore, useCourseStore } from "@/stores/lms-store";
import { useNavigation } from "@/hooks/use-navigation";
import { ROUTES } from "@/lib/routes";
import { DEFAULT_STYLE } from "@/lib/slide-styles";
import type { CategoryItem } from "@/types/lms";
import type {
  OutlineLessonDraft,
  SlideGenState,
} from "@/components/lms/create-course/outline-lesson-card";
import { toLessonDraft, type OutlineSectionResponse } from "@/components/lms/create-course/model";

// ============================================
// The course record behind the Create Course page
//
// Everything about the course itself: the form fields, the draft's id, the
// category list, restoring a course that is being edited, and the two writes —
// saving a draft so a lesson can be attached to it, and publishing.
//
// It does not know anything about outlines or slide generation. The one place
// the two meet is reopening a saved course, whose response carries both the
// course fields and its lessons; the lessons are handed over through
// onLessonsLoaded rather than by reaching into the other hook's state.
// ============================================

export interface UseCourseDraftOptions {
  /** Owned by useCourseUploads, which handles the file itself. */
  coverImage: string;
  setCoverImage: (url: string) => void;
}

/** The lessons of a reopened course, handed to the workflow hook to adopt. */
export interface LoadedLessons {
  lessons: OutlineLessonDraft[];
  slideStates: Record<string, SlideGenState>;
}

export function useCourseDraft({ coverImage, setCoverImage }: UseCourseDraftOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { goBack } = useNavigation();
  const { currentUserId } = useUserStore();
  const { createPrompt, setCreatePrompt, editingCourseId, setEditingCourseId } = useCourseStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [language, setLanguage] = useState("english");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Set once, when a saved course is reopened. useLessonWorkflow adopts it;
  // handing it over as state keeps the two hooks in one direction rather than
  // calling back into a hook that has not been created yet.
  const [loadedLessons, setLoadedLessons] = useState<LoadedLessons | null>(null);

  // The draft's id lives in the URL.
  //
  // It used to live only in component state, so leaving the page for the
  // lesson preview unmounted the component and destroyed it — coming back gave
  // an empty Create Course form even though the course was saved. A query
  // parameter survives navigation, refresh and the browser's back button.
  const courseId = searchParams.get("courseId");

  /** Record the draft in the URL, replacing rather than pushing so Back still
   *  leaves the create page rather than stepping through its own saves. */
  const setCourseId = useCallback(
    (id: string | null) => {
      if (!id || id === courseId) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("courseId", id);
      router.replace(`${ROUTES["create-course"]}?${next.toString()}`);
    },
    [courseId, searchParams, router],
  );

  // ---- Load existing course when editing from dashboard ----
  useEffect(() => {
    if (editingCourseId && !courseId) {
      setCourseId(editingCourseId);
      setEditingCourseId(null);
    }
  }, [editingCourseId, courseId, setEditingCourseId, setCourseId]);

  // ---- Pre-fill title from hero prompt ----
  useEffect(() => {
    if (createPrompt) {
      setTitle(createPrompt);
      setCreatePrompt("");
    }
  }, [createPrompt, setCreatePrompt]);

  // ---- Fetch categories ----
  useEffect(() => {
    async function fetchCategories() {
      setLoading(true);
      try {
        const res = await fetch("/api/categories");
        const json = await res.json();
        if (json.success) {
          setCategories(json.data);
        }
      } catch {
        toast.error("Failed to load categories");
      } finally {
        setLoading(false);
      }
    }
    fetchCategories();
  }, []);

  // ---- Load existing course data when editing ----
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}`);
        const json = await res.json();
        if (!json.success || cancelled) return;
        const c = json.data;
        if (c.title) setTitle(c.title);
        if (c.description) setDescription(c.description);
        if (c.categoryId) setCategoryId(c.categoryId);
        if (c.language) setLanguage(c.language);
        if (c.coverImage) setCoverImage(c.coverImage);

        // Load lessons with their sections and slides
        if (c.lessons && c.lessons.length > 0) {
          const restoredStates: Record<string, SlideGenState> = {};

          const lessonDrafts: OutlineLessonDraft[] = c.lessons.map(
            (lesson: {
              id: string;
              title: string;
              outlineJson: string | null;
              sections?: OutlineSectionResponse[];
              slides?: {
                id: string;
                title: string;
                htmlBody: string;
                status: string;
                order: number;
                sectionId: string | null;
              }[];
            }) => {
              const parsedOutline = lesson.outlineJson ? JSON.parse(lesson.outlineJson) : null;
              const lessonSlides = lesson.slides ?? [];

              // Rebuild the preview map from stored HTML. It is only filled in
              // during generation, so reopening a draft course previously left
              // it empty and the preview button showed nothing.
              for (const slide of lessonSlides) {
                if (slide.status === "READY" && slide.htmlBody) {
                  restoredStates[slide.id] = { status: "complete", htmlBody: slide.htmlBody };
                } else if (slide.status === "ERROR") {
                  restoredStates[slide.id] = { status: "error", error: "Generation failed" };
                }
              }

              const { lesson: draft } = toLessonDraft(
                {
                  id: lesson.id,
                  title: lesson.title,
                  slides: lessonSlides,
                  sections: lesson.sections,
                  requestedSlideCount: parsedOutline?.slideCount,
                  adjustments: parsedOutline?.adjustments,
                  // Reopening a saved course restores the brief too, so the
                  // outline reads the same as when it was first planned.
                  audience: parsedOutline?.audience,
                  thesis: parsedOutline?.thesis,
                  misconception: parsedOutline?.misconception,
                },
                {
                  language: c.language || "english",
                  style: parsedOutline?.style || DEFAULT_STYLE,
                  topic: parsedOutline?.topic || lesson.title,
                },
              );

              return {
                ...draft,
                allReady:
                  lessonSlides.length > 0 && lessonSlides.every((s) => s.status === "READY"),
              };
            },
          );

          setLoadedLessons({ lessons: lessonDrafts, slideStates: restoredStates });
        }
      } catch {
        toast.error("Failed to load course data");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, currentUserId, setCoverImage]);

  // ---- Auto-save course as draft (needed before outline generation) ----
  const ensureCourseSaved = useCallback(async (): Promise<string | null> => {
    if (courseId) return courseId;
    if (!title.trim() || !currentUserId) {
      toast.error("Please enter a course title first");
      return null;
    }
    try {
      const res = await fetch("/api/courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          categoryId: categoryId || null,
          language,
          creatorId: currentUserId,
          coverImage: coverImage || null,
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.id) {
        setCourseId(json.data.id);
        return json.data.id;
      }
      toast.error("Failed to save course draft");
      return null;
    } catch {
      toast.error("Failed to save course draft");
      return null;
    }
  }, [courseId, title, description, categoryId, language, currentUserId, coverImage]);

  /**
   * Publish the course.
   *
   * `isGenerating` is passed in rather than held here: whether slides are
   * still being written belongs to the workflow hook, and this only needs to
   * know it in order to refuse.
   */
  const publishCourse = useCallback(
    async (isGenerating: boolean) => {
      if (!title.trim()) {
        toast.error("Course title is required");
        return;
      }

      // Check if any lesson is still generating
      if (isGenerating) {
        toast.error("Please wait for slide generation to finish");
        return;
      }

      setSaving(true);
      try {
        if (courseId) {
          // Update existing course to published
          const res = await fetch(`/api/courses/${courseId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: title.trim(),
              description: description.trim() || null,
              categoryId: categoryId || null,
              language,
              coverImage: coverImage || null,
              status: "published",
            }),
          });
          const json = await res.json();
          if (json.success) {
            toast.success("Course published successfully!");
            goBack();
          } else {
            toast.error(json.error || "Failed to publish course");
          }
        } else {
          toast.error("Please add at least one lesson first");
        }
      } catch {
        toast.error("Failed to save course. Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [title, description, categoryId, language, coverImage, courseId, goBack],
  );

  return {
    // form fields
    title,
    setTitle,
    description,
    setDescription,
    categoryId,
    setCategoryId,
    language,
    setLanguage,
    categories,
    // status
    loading,
    saving,
    courseId,
    loadedLessons,
    // actions
    ensureCourseSaved,
    publishCourse,
  };
}
