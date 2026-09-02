import { DEFAULT_STYLE } from "@/lib/slide-styles";
import type {
  OutlineLessonDraft,
  OutlineSlideDraft,
} from "@/components/lms/create-course/outline-lesson-card";

// ============================================
// Create Course — shared model
//
// The limits the form enforces, the shape the outline endpoint returns, and
// the function that turns one into a reviewable draft. Shared by the page and
// by the two hooks behind it, so none of them owns a copy.
// ============================================

export const MAX_LESSONS = 10;
export const MAX_TITLE_LENGTH = 100;
export const MAX_DESC_LENGTH = 3000;
export const MAX_COURSE_DESC_LENGTH = 500;

/** A section as returned by the outline endpoint. */
export interface OutlineSectionResponse {
  id: string;
  title: string;
  summary: string;
  subtopics: string[];
  claim?: string;
  vehicle?: string;
  slideBudget: number;
  order: number;
}

/** Build the reviewable draft from a phase-one response. */
export function toLessonDraft(
  lessonData: {
    id: string;
    title: string;
    subtitle?: string;
    slides: { id: string; title: string; order: number }[];
    sections?: OutlineSectionResponse[];
    requestedSlideCount?: number;
    adjustments?: string[];
    audience?: string;
    thesis?: string;
    misconception?: string;
    keyTerms?: string[];
    /** Set when the lesson came from an uploaded deck rather than a plan. */
    uploaded?: boolean;
  },
  meta: { language: string; style: string; topic: string },
): { lesson: OutlineLessonDraft; slides: OutlineSlideDraft[] } {
  const sections = lessonData.sections ?? [];
  const byId = new Map(sections.map((sec) => [sec.id, sec]));

  const slides: OutlineSlideDraft[] = lessonData.slides.map((s, i) => ({
    id: `local_${Date.now()}_${i}`,
    slideId: s.id,
    title: s.title,
    // The outline a slide answers to is now its section's summary.
    outline:
      byId.get((s as { sectionId?: string }).sectionId ?? "")?.summary ??
      sections[0]?.summary ??
      "",
    order: s.order,
  }));

  return {
    lesson: {
      id: lessonData.id,
      title: lessonData.title,
      subtitle: lessonData.subtitle,
      uploaded: lessonData.uploaded,
      slides,
      sections: sections.map((sec) => ({
        id: sec.id,
        title: sec.title,
        summary: sec.summary,
        subtopics: sec.subtopics ?? [],
        claim: sec.claim,
        vehicle: sec.vehicle,
        slideBudget: sec.slideBudget,
        order: sec.order,
      })),
      requestedSlideCount: lessonData.requestedSlideCount,
      // Older saved plans may still contain the former slide-count advisory.
      // The dedicated recommendation dialog handles that choice now, so do
      // not repeat the passive note in the presentation plan.
      adjustments: lessonData.adjustments?.filter(
        (note) => !note.includes("slides to be taught properly"),
      ),
      audience: lessonData.audience,
      thesis: lessonData.thesis,
      misconception: lessonData.misconception,
      keyTerms: lessonData.keyTerms,
      language: meta.language,
      style: meta.style,
      topic: meta.topic,
    },
    slides,
  };
}
