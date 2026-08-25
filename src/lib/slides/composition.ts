import { z } from "zod/v4";

// ============================================
// Slide composition
//
// What a designer produces: a slide laid out for what it has to say. Boxes
// where this slide needs boxes, an arrow where one thing leads to another, a
// number in a circle where the order matters.
//
// The pipeline's other model of a slide — a typed content object poured into
// one of nine pre-built layouts — was chosen so a model could never invent
// geometry. It bought template fidelity at the price of every slide being one
// of nine arrangements, whatever it was about. This is the other trade: the
// model composes freely, and what keeps the deck on-brand is that it cannot
// name a colour, a font or a type size at all. It names roles, and the roles
// resolve to the template's own values.
//
// So a slide may be any arrangement, and it can only ever be drawn in the
// Ecotech navy, the mint, the panel tint, the two type families and the
// measured type scale. Nothing here can produce an off-brand slide.
// ============================================

/** Fill roles. Each resolves to a colour in the active template's palette. */
export const FILL_ROLES = [
  "surface",
  "surfaceAlt",
  "panel",
  "accent",
  "accentSoft",
  "heading",
  /** The template's own navy-to-mint gradient, as it uses on emphasis bands. */
  "gradient",
  "none",
] as const;

/** Ink roles for text and glyphs. */
export const INK_ROLES = [
  "heading",
  "body",
  "muted",
  "accent",
  "onAccent",
  "iconInk",
  "featureHeading",
  "featureBody",
] as const;

/**
 * Type roles, which resolve to the point sizes measured from the template.
 *
 * A slide names the role its text plays; the size comes from the template's
 * scale. Free numbers would let one slide's "heading" be 22pt and another's
 * 30pt, which is how a deck stops looking like one deck.
 */
export const TEXT_ROLES = [
  "display",
  "title",
  "heading",
  "body",
  "small",
  "eyebrow",
  "metric",
] as const;

const Fraction = z.number().min(0).max(1);

const Box = {
  x: Fraction.describe("Left edge, as a fraction of slide width"),
  y: Fraction.describe("Top edge, as a fraction of slide height"),
  w: Fraction.describe("Width, as a fraction of slide width"),
  h: Fraction.describe("Height, as a fraction of slide height"),
};

/** A filled rectangle: a card, a band, a tinted panel behind content. */
export const ShapeElementSchema = z.object({
  kind: z.enum(["card", "band"]),
  ...Box,
  fill: z.enum(FILL_ROLES).describe("Which template colour fills it"),
  /**
   * Corner treatment. The rounding itself is the template's, not a number a
   * slide chooses: "default" is the radius its own cards use.
   */
  corner: z.enum(["default", "square", "pill"]).optional(),
  /** Screened back, for decorative shapes only. */
  alpha: z.number().min(0.05).max(1).optional(),
});

/** A circle or pill, for step numbers and icon holders. */
export const ChipElementSchema = z.object({
  kind: z.literal("chip"),
  ...Box,
  fill: z.enum(FILL_ROLES),
  /** A short label: a step number, a letter, a symbol. */
  text: z.string().max(4).optional(),
  ink: z.enum(INK_ROLES).optional(),
  icon: z.string().max(24).optional().describe("Icon name drawn inside the chip"),
});

/** A run of text. */
export const TextElementSchema = z.object({
  kind: z.literal("text"),
  ...Box,
  text: z.string().min(1).max(600),
  role: z.enum(TEXT_ROLES).describe("What this text is, which fixes its size"),
  ink: z.enum(INK_ROLES).optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  bold: z.boolean().optional(),
});

/** A standalone icon glyph. */
export const IconElementSchema = z.object({
  kind: z.literal("icon"),
  ...Box,
  icon: z.string().min(1).max(24),
  ink: z.enum(INK_ROLES).optional(),
});

/**
 * A connector between two things.
 *
 * Straight, horizontal or vertical, because those are the connectors the
 * template's own diagrams use and the only ones both renderers can draw
 * identically.
 */
export const ConnectorElementSchema = z.object({
  kind: z.enum(["arrow", "line"]),
  ...Box,
  direction: z.enum(["right", "left", "down", "up"]).optional(),
  ink: z.enum(INK_ROLES).optional(),
});

export const SlideElementSchema = z.discriminatedUnion("kind", [
  ShapeElementSchema,
  ChipElementSchema,
  TextElementSchema,
  IconElementSchema,
  ConnectorElementSchema,
]);

export const SlideCompositionSchema = z.object({
  /** Named so a later pass can tell what the slide was trying to be. */
  layoutNote: z
    .string()
    .max(120)
    .optional()
    .describe("What arrangement this is, in a few words — 'three cards', 'four-step flow'"),
  elements: z.array(SlideElementSchema).min(1).max(48),
});

export type SlideElement = z.infer<typeof SlideElementSchema>;
export type SlideComposition = z.infer<typeof SlideCompositionSchema>;
export type FillRole = (typeof FILL_ROLES)[number];
export type InkRole = (typeof INK_ROLES)[number];
export type TextRole = (typeof TEXT_ROLES)[number];

/** Whether a stored contentJson is a composition rather than typed content. */
export function isComposition(parsed: unknown): parsed is SlideComposition {
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as { elements?: unknown }).elements)
  );
}

/**
 * The words a composed slide says, in reading order.
 *
 * The critics, the quiz generator and the search over a lesson all read a
 * slide as text. A composition has no fields to walk, so its text is its text
 * elements in the order they were composed — which is the order they were
 * written to be read in.
 */
export function compositionText(composition: SlideComposition): string {
  return composition.elements
    .filter((e): e is Extract<SlideElement, { kind: "text" }> => e.kind === "text")
    .map((e) => e.text.trim())
    .filter(Boolean)
    .join(" · ");
}

/** The slide's own title, for the lesson list and the deck's contents. */
export function compositionTitle(composition: SlideComposition): string | null {
  const ranked = ["display", "title", "heading"] as const;
  for (const role of ranked) {
    const found = composition.elements.find((e) => e.kind === "text" && e.role === role);
    if (found && found.kind === "text") return found.text.slice(0, 90);
  }
  return null;
}
