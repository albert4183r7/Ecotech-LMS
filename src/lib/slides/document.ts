import { SlideContentSchema, type SlideContent } from "./content-schema";
import {
  SlideCompositionSchema,
  compositionText,
  compositionTitle,
  isComposition,
  type SlideComposition,
} from "./composition";
import { renderComposition } from "./composition-render";
import { renderSlideContent } from "./render";

// ============================================
// A stored slide, whichever way it was authored
//
// Slides are composed now: the model lays the slide out and the template
// supplies every colour, font and size. Lessons generated before that are
// typed content poured into one of the nine template layouts, and they still
// have to render, export, be quizzed on and be edited.
//
// So every read path goes through here rather than assuming a shape. One
// place decides which of the two a stored contentJson is, and the callers
// stay honest: nothing downstream parses contentJson itself.
// ============================================

export type SlideDoc =
  | { kind: "composition"; composition: SlideComposition }
  | { kind: "content"; content: SlideContent };

/** Read a stored contentJson, or null when it is neither shape. */
export function parseSlideDoc(json: string | null | undefined): SlideDoc | null {
  if (!json) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }

  if (isComposition(raw)) {
    const parsed = SlideCompositionSchema.safeParse(raw);
    return parsed.success ? { kind: "composition", composition: parsed.data } : null;
  }

  const parsed = SlideContentSchema.safeParse(raw);
  return parsed.success ? { kind: "content", content: parsed.data } : null;
}

/** Render a slide to the HTML fragment wrapSlideHtml wraps. */
export function renderSlideDoc(doc: SlideDoc, options: { slideNumber?: number } = {}): string {
  return doc.kind === "composition"
    ? renderComposition(doc.composition, options)
    : renderSlideContent(doc.content, options);
}

/** Everything the slide says, as the critics and the quiz read it. */
export function slideDocText(doc: SlideDoc): string {
  return doc.kind === "composition" ? compositionText(doc.composition) : contentToText(doc.content);
}

/** The slide's own title, or the given fallback when it has none. */
export function slideDocTitle(doc: SlideDoc, fallback: string): string {
  if (doc.kind === "composition") return compositionTitle(doc.composition) ?? fallback;
  return "title" in doc.content && doc.content.title ? doc.content.title.slice(0, 90) : fallback;
}

/** Flatten typed content into the sentences it renders as. */
export function contentToText(content: SlideContent): string {
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
