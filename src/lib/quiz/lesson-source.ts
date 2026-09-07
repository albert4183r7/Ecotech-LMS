import { db } from "@/lib/db";
import { extractSlideText } from "@/lib/slides/text";
import { parseSlideDoc, slideDocText } from "@/lib/slides/document";

// ============================================
// The lesson as the quiz's only source of truth
//
// A quiz must be answerable from its own lesson and from nothing else, so the
// text assembled here is the entire world the generator and the validator are
// allowed to see. Nothing from other lessons, the course description or the
// original reference document is included: a question grounded in a document
// the learner never saw is exactly the failure this guards against.
// ============================================

/** One slide's words, kept separately so a caller can point at one of them. */
export interface LessonSourceSlide {
  /** 1-based, as the learner sees it. */
  number: number;
  title: string;
  text: string;
}

export interface LessonSource {
  lessonId: string;
  lessonTitle: string;
  courseId: string;
  courseTitle: string;
  language: string;
  /** Everything the lesson teaches, slide by slide, as plain text. */
  text: string;
  slides: LessonSourceSlide[];
  slideCount: number;
}

/**
 * Read one lesson's generated content.
 *
 * Structured content is preferred because it is exactly what the slide says;
 * the rendered HTML is a fallback for slides authored before that model, and
 * carries the same words through a coarser path.
 */
export async function loadLessonSource(lessonId: string): Promise<LessonSource | null> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      courseId: true,
      outlineJson: true,
      course: { select: { title: true, language: true } },
      slides: {
        where: { status: "READY" },
        orderBy: { order: "asc" },
        select: { title: true, contentJson: true, htmlBody: true, order: true },
      },
    },
  });
  if (!lesson || lesson.slides.length === 0) return null;

  const slides: LessonSourceSlide[] = [];
  for (const slide of lesson.slides) {
    const doc = parseSlideDoc(slide.contentJson);
    let body = doc ? slideDocText(doc) : "";
    if (!body) body = extractSlideText(slide.htmlBody);
    if (body.trim()) {
      slides.push({ number: slide.order + 1, title: slide.title, text: body.trim() });
    }
  }

  if (slides.length === 0) return null;

  let language = lesson.course.language;
  try {
    const outline = JSON.parse(lesson.outlineJson ?? "{}") as { language?: unknown };
    if (typeof outline.language === "string" && outline.language.trim()) {
      language = outline.language;
    }
  } catch {
    // Uploaded/legacy lessons use the course language.
  }

  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    courseId: lesson.courseId,
    courseTitle: lesson.course.title,
    language,
    text: slides.map((s) => `--- Slide ${s.number}: ${s.title} ---\n${s.text}`).join("\n\n"),
    slides,
    slideCount: lesson.slides.length,
  };
}
