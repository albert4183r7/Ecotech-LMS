import { z } from "zod/v4";

// ============================================
// Semantic slide content
//
// The model describes what a slide says; the renderer decides how it looks.
// Previously the model emitted raw HTML, so visual quality depended entirely
// on what it happened to write, and a thin answer became a slide with a large
// empty area. A typed block cannot render empty: either it has the content its
// type requires or it fails validation.
// ============================================

/** Name of a slide icon; see ICON_NAMES. Unknown names resolve to a fallback. */
const Icon = z.string().max(24).optional().describe("Icon name that suits this item");

/**
 * The line the template prints in its gradient band at the foot of a content
 * slide.
 *
 * Not a summary of the slide — the point of it. A slide that has taught
 * something can say what the audience should now do differently, and a slide
 * that cannot is usually a slide that only defined a word.
 */
const Takeaway = z
  .string()
  .min(15)
  .max(115)
  .optional()
  .describe("One sentence: what the audience should carry away from this slide");

const Point = z.object({
  heading: z.string().min(2).max(70).describe("A few words naming the idea"),
  description: z.string().min(15).max(260).describe("What it means, in a full sentence"),
  icon: Icon,
});

export const TitleSlideSchema = z.object({
  type: z.literal("title"),
  eyebrow: z.string().max(60).optional().describe("Small label above the title"),
  title: z.string().min(3).max(90),
  subtitle: z.string().min(10).max(180),
});

export const ConceptSlideSchema = z.object({
  type: z.literal("concept"),
  /**
   * The mint section label the template prints above every content slide's
   * title ("02 · FOUNDATIONS"). The slot exists in the template; without a
   * field for it the slide rendered with the label missing and a gap where
   * the template puts it.
   */
  eyebrow: z
    .string()
    .max(40)
    .optional()
    .describe("Short section label above the title, e.g. the part of the lesson this belongs to"),
  title: z.string().min(3).max(90),
  lead: z.string().min(20).max(280).optional().describe("A sentence framing the slide"),
  points: z.array(Point).min(2).max(5),
  takeaway: Takeaway,
});

export const ComparisonSlideSchema = z.object({
  type: z.literal("comparison"),
  /**
   * The mint section label the template prints above every content slide's
   * title ("02 · FOUNDATIONS"). The slot exists in the template; without a
   * field for it the slide rendered with the label missing and a gap where
   * the template puts it.
   */
  eyebrow: z
    .string()
    .max(40)
    .optional()
    .describe("Short section label above the title, e.g. the part of the lesson this belongs to"),
  title: z.string().min(3).max(90),
  lead: z.string().min(20).max(280).optional(),
  columns: z
    .array(
      z.object({
        heading: z.string().min(2).max(50),
        points: z.array(z.string().min(8).max(160)).min(2).max(5),
        icon: Icon,
      }),
    )
    .min(2)
    .max(3),
  takeaway: Takeaway,
});

export const ProcessSlideSchema = z.object({
  type: z.literal("process"),
  /**
   * The mint section label the template prints above every content slide's
   * title ("02 · FOUNDATIONS"). The slot exists in the template; without a
   * field for it the slide rendered with the label missing and a gap where
   * the template puts it.
   */
  eyebrow: z
    .string()
    .max(40)
    .optional()
    .describe("Short section label above the title, e.g. the part of the lesson this belongs to"),
  title: z.string().min(3).max(90),
  lead: z.string().min(20).max(280).optional(),
  steps: z
    .array(
      z.object({
        label: z.string().min(2).max(50),
        description: z.string().min(10).max(200),
        icon: Icon,
      }),
    )
    .min(3)
    .max(6),
  takeaway: Takeaway,
});

export const ArchitectureSlideSchema = z.object({
  type: z.literal("architecture"),
  /**
   * The mint section label the template prints above every content slide's
   * title ("02 · FOUNDATIONS"). The slot exists in the template; without a
   * field for it the slide rendered with the label missing and a gap where
   * the template puts it.
   */
  eyebrow: z
    .string()
    .max(40)
    .optional()
    .describe("Short section label above the title, e.g. the part of the lesson this belongs to"),
  title: z.string().min(3).max(90),
  lead: z.string().min(20).max(280).optional(),
  nodes: z
    .array(
      z.object({
        label: z.string().min(2).max(46),
        description: z.string().min(8).max(140).optional(),
        icon: Icon,
      }),
    )
    .min(3)
    .max(6)
    .describe("Ordered stages of the flow, drawn as a chain"),
  takeaway: Takeaway,
});

export const CaseStudySlideSchema = z.object({
  type: z.literal("caseStudy"),
  /**
   * The mint section label the template prints above every content slide's
   * title ("02 · FOUNDATIONS"). The slot exists in the template; without a
   * field for it the slide rendered with the label missing and a gap where
   * the template puts it.
   */
  eyebrow: z
    .string()
    .max(40)
    .optional()
    .describe("Short section label above the title, e.g. the part of the lesson this belongs to"),
  title: z.string().min(3).max(90),
  situation: z.string().min(20).max(300),
  problem: z.string().min(20).max(300),
  action: z.string().min(20).max(300),
  outcome: z.string().min(20).max(300),
  takeaway: Takeaway,
});

export const DataSlideSchema = z.object({
  type: z.literal("data"),
  /**
   * The mint section label the template prints above every content slide's
   * title ("02 · FOUNDATIONS"). The slot exists in the template; without a
   * field for it the slide rendered with the label missing and a gap where
   * the template puts it.
   */
  eyebrow: z
    .string()
    .max(40)
    .optional()
    .describe("Short section label above the title, e.g. the part of the lesson this belongs to"),
  title: z.string().min(3).max(90),
  lead: z.string().min(20).max(280).optional(),
  stats: z
    .array(
      z.object({
        value: z.string().min(1).max(18).describe("The figure itself"),
        label: z.string().min(3).max(60),
        note: z.string().max(120).optional(),
        icon: Icon,
      }),
    )
    .min(2)
    .max(4)
    .describe("Only use when the figures come from supplied reference material"),
  takeaway: Takeaway,
});

export const SummarySlideSchema = z.object({
  type: z.literal("summary"),
  /**
   * The mint section label the template prints above every content slide's
   * title ("02 · FOUNDATIONS"). The slot exists in the template; without a
   * field for it the slide rendered with the label missing and a gap where
   * the template puts it.
   */
  eyebrow: z
    .string()
    .max(40)
    .optional()
    .describe("Short section label above the title, e.g. the part of the lesson this belongs to"),
  title: z.string().min(3).max(90),
  takeaways: z.array(z.string().min(15).max(200)).min(3).max(6),
  takeaway: Takeaway,
});

export const ClosingSlideSchema = z.object({
  type: z.literal("closing"),
  title: z.string().min(2).max(70),
  subtitle: z.string().min(5).max(180).optional(),
});

export const SlideContentSchema = z.discriminatedUnion("type", [
  TitleSlideSchema,
  ConceptSlideSchema,
  ComparisonSlideSchema,
  ProcessSlideSchema,
  ArchitectureSlideSchema,
  CaseStudySlideSchema,
  DataSlideSchema,
  SummarySlideSchema,
  ClosingSlideSchema,
]);

export type SlideContent = z.infer<typeof SlideContentSchema>;
export type SlideType = SlideContent["type"];

/** Slide types the model may choose for an ordinary content slide. */
export const CONTENT_SLIDE_TYPES: SlideType[] = [
  "concept",
  "comparison",
  "process",
  "architecture",
  "caseStudy",
  "data",
  "summary",
];

/** Roughly how much a slide says, used to catch thin output. */
export function contentWeight(content: SlideContent): number {
  switch (content.type) {
    case "title":
      return content.title.length + content.subtitle.length;
    case "concept":
      return content.points.reduce((n, p) => n + p.heading.length + p.description.length, 0);
    case "comparison":
      return content.columns.reduce((n, c) => n + c.points.join(" ").length, 0);
    case "process":
      return content.steps.reduce((n, s) => n + s.label.length + s.description.length, 0);
    case "architecture":
      return content.nodes.reduce((n, x) => n + x.label.length + (x.description?.length ?? 0), 0);
    case "caseStudy":
      return (
        content.situation.length +
        content.problem.length +
        content.action.length +
        content.outcome.length
      );
    case "data":
      return content.stats.reduce((n, s) => n + s.label.length + (s.note?.length ?? 0), 0);
    case "summary":
      return content.takeaways.join(" ").length;
    case "closing":
      return content.title.length + (content.subtitle?.length ?? 0);
  }
}
