import type { ClassroomSlide, ClassroomState } from "@/types/lms";

// ============================================
// Classroom state construction
//
// Three separate places built this state and each kept only slides[0], so a
// lesson of any length opened showing one slide. Building it in one place
// keeps them from drifting apart again.
// ============================================

export const EMPTY_SLIDE_HTML =
  '<div class="flex items-center justify-center h-full"><p class="text-gray-500">No content available.</p></div>';

/** A slide as returned by /api/lessons/[id]. */
interface RawSlide {
  id: string;
  title?: string;
  htmlBody?: string;
  order?: number;
  narrationText?: string;
}

/**
 * Keep every slide that has content, in order.
 *
 * Slides that failed to generate have no HTML and are skipped rather than
 * shown as blank pages in the middle of a deck.
 */
export function toClassroomSlides(raw: unknown): ClassroomSlide[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawSlide[])
    .filter((slide) => Boolean(slide?.htmlBody))
    .map((slide, index) => ({
      id: slide.id,
      title: slide.title ?? "",
      htmlBody: slide.htmlBody as string,
      order: typeof slide.order === "number" ? slide.order : index,
      narrationText: slide.narrationText?.trim() || slide.title || "",
    }))
    .sort((a, b) => a.order - b.order);
}

export interface BuildClassroomStateParams {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  language: string;
  /** Raw slides from the lesson endpoint. */
  slides: unknown;
  allLessonIds: string[];
}

/** Build classroom state, falling back to a placeholder when nothing generated. */
export function buildClassroomState(params: BuildClassroomStateParams): ClassroomState {
  const slides = toClassroomSlides(params.slides);

  return {
    courseId: params.courseId,
    courseTitle: params.courseTitle,
    lessonId: params.lessonId,
    lessonTitle: params.lessonTitle,
    language: params.language,
    slides:
      slides.length > 0
        ? slides
        : [
            {
              id: "",
              title: params.lessonTitle,
              htmlBody: EMPTY_SLIDE_HTML,
              narrationText: params.lessonTitle,
              order: 0,
            },
          ],
    currentSlideIndex: 0,
    allLessonIds: params.allLessonIds,
    currentLessonIndex: Math.max(0, params.allLessonIds.indexOf(params.lessonId)),
  };
}
