import { db } from "@/lib/db";
import { extractSlideText } from "@/lib/slides/text";
import { SlideContentSchema, type SlideContent } from "@/lib/slides/content-schema";

// ============================================
// The lesson as the quiz's only source of truth
//
// A quiz must be answerable from its own lesson and from nothing else, so the
// text assembled here is the entire world the generator and the validator are
// allowed to see. Nothing from other lessons, the course description or the
// original reference document is included: a question grounded in a document
// the learner never saw is exactly the failure this guards against.
// ============================================

export interface LessonSource {
  lessonId: string;
  lessonTitle: string;
  /** Everything the lesson teaches, slide by slide, as plain text. */
  text: string;
  slideCount: number;
}

/** Flatten structured slide content into the sentences it renders as. */
function contentToText(content: SlideContent): string {
  switch (content.type) {
    case "title":
      return [content.eyebrow, content.title, content.subtitle].filter(Boolean).join(". ");
    case "closing":
      return [content.title, content.subtitle].filter(Boolean).join(". ");
    case "concept":
      return [
        content.title,
        content.lead,
        ...content.points.map((p) => `${p.heading}: ${p.description}`),
      ]
        .filter(Boolean)
        .join(" ");
    case "comparison":
      return [
        content.title,
        content.lead,
        ...content.columns.map((c) => `${c.heading}: ${c.points.join("; ")}`),
      ]
        .filter(Boolean)
        .join(" ");
    case "process":
      return [
        content.title,
        content.lead,
        ...content.steps.map((s, i) => `Step ${i + 1}, ${s.label}: ${s.description}`),
      ]
        .filter(Boolean)
        .join(" ");
    case "architecture":
      return [
        content.title,
        content.lead,
        ...content.nodes.map((n) => `${n.label}${n.description ? `: ${n.description}` : ""}`),
      ]
        .filter(Boolean)
        .join(" ");
    case "caseStudy":
      return [
        content.title,
        `Situation: ${content.situation}`,
        `Problem: ${content.problem}`,
        `Action: ${content.action}`,
        `Outcome: ${content.outcome}`,
      ].join(" ");
    case "data":
      return [
        content.title,
        content.lead,
        ...content.stats.map((s) => `${s.value} — ${s.label}${s.note ? ` (${s.note})` : ""}`),
      ]
        .filter(Boolean)
        .join(" ");
    case "summary":
      return [content.title, ...content.takeaways].join(" ");
  }
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
      slides: {
        where: { status: "READY" },
        orderBy: { order: "asc" },
        select: { title: true, contentJson: true, htmlBody: true, order: true },
      },
    },
  });
  if (!lesson || lesson.slides.length === 0) return null;

  const parts: string[] = [];
  for (const slide of lesson.slides) {
    let body = "";
    if (slide.contentJson) {
      const parsed = SlideContentSchema.safeParse(JSON.parse(slide.contentJson));
      if (parsed.success) body = contentToText(parsed.data);
    }
    if (!body) body = extractSlideText(slide.htmlBody);
    if (body.trim()) parts.push(`--- Slide ${slide.order + 1}: ${slide.title} ---\n${body.trim()}`);
  }

  if (parts.length === 0) return null;

  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    text: parts.join("\n\n"),
    slideCount: lesson.slides.length,
  };
}
