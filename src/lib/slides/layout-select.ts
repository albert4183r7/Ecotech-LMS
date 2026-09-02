import type { SlideContent } from "./content-schema";
import {
  LAYOUTS,
  layoutsFor,
  capacityOf,
  type LayoutDefinition,
  type RenderedLayout,
} from "./template-layouts";

// ============================================
// Choosing a template layout for a slide
//
// The model chooses the slide's *type* — what shape the material has — while
// the layout that presents it is chosen here, deterministically, from the
// content's actual size. A model asked to pick pixel geometry invents layouts
// that resemble the template; asked only "is this a comparison or a process?"
// it answers something it can actually know.
//
// Where a content type has more than one candidate layout, the item count
// decides: three points fit the template's card row, five need its row
// structure. Nothing is squeezed into a layout too small for it.
// ============================================

/** How many repeated items a slide's content carries. */
export function itemCountOf(content: SlideContent): number {
  switch (content.type) {
    case "contents":
      return content.sections.length;
    case "concept":
      return content.points.length;
    case "custom":
      return 1;
    case "comparison":
      return content.columns.length;
    case "process":
      return content.steps.length;
    case "architecture":
      return content.nodes.length;
    case "data":
      return content.stats.length;
    case "summary":
      return content.takeaways.length;
    case "caseStudy":
      return 4;
    case "title":
    case "closing":
      return 0;
  }
}

export interface LayoutChoice {
  definition: LayoutDefinition;
  layout: RenderedLayout;
  /** Set when no layout could hold the content and one was used anyway. */
  overflowWarning?: string;
}

function hasLead(content: SlideContent): boolean {
  return "lead" in content && typeof content.lead === "string" && content.lead.length > 0;
}

/** Whether the slide carries a takeaway, which the layout draws a band for. */
function hasTakeaway(content: SlideContent): boolean {
  return (
    "takeaway" in content && typeof content.takeaway === "string" && content.takeaway.length > 0
  );
}

/**
 * Pick the template layout for a slide.
 *
 * Falls back rather than failing: a content shape with no matching layout
 * still renders, in the closest layout that exists, with a warning recorded so
 * the mismatch is visible instead of silent.
 */
export function selectLayout(content: SlideContent, position?: number): LayoutChoice {
  const items = itemCountOf(content);
  let candidates = layoutsFor(content.type, items);

  // The template has two layouts for a title: slide 1 opens the deck, slide 3
  // divides it. Which one a title slide gets is its position, not a judgement
  // — so the first slide is the title slide and any later one is a section
  // divider, exactly as the template uses them.
  if (content.type === "title") {
    const wanted = position === undefined || position <= 1 ? "title" : "section";
    const chosen = candidates.filter((l) => l.id === wanted);
    if (chosen.length > 0) candidates = chosen;
  }

  if (candidates.length > 0) {
    // Prefer the tightest fit — the layout whose capacity the content fills
    // most nearly, so four points get the row layout rather than a card row
    // stretched to hold them.
    const best = candidates.reduce((a, b) =>
      b.capacity.max - items < a.capacity.max - items ? b : a,
    );
    return {
      definition: best,
      layout: best.build(items, {
        hasLead: hasLead(content),
        hasTakeaway: hasTakeaway(content),
      }),
    };
  }

  // No layout supports this shape at this size. Use one that supports the type
  // at all, clamped to its capacity.
  const byType = LAYOUTS.filter((l) => l.supports.includes(content.type));
  const fallback = byType[0] ?? LAYOUTS.find((l) => l.id === "agenda")!;
  const clamped = Math.min(Math.max(items, fallback.capacity.min), fallback.capacity.max);

  return {
    definition: fallback,
    layout: fallback.build(clamped, {
      hasLead: hasLead(content),
      hasTakeaway: hasTakeaway(content),
    }),
    overflowWarning:
      `${content.type} with ${items} item(s) has no template layout; ` +
      `using "${fallback.id}" at ${clamped}. Content beyond that is not shown.`,
  };
}

/**
 * Field names as the generator knows them, for a layout's internal slot names.
 *
 * A layout shared between content types addresses generic slots; the model
 * only knows the schema's own field names, so quoting "item.N.primary" at it
 * would be advice it cannot act on.
 */
const SLOT_NAMES: Partial<Record<SlideContent["type"], Record<string, string>>> = {
  process: { "item.N.primary": "steps.N.label", "item.N.secondary": "steps.N.description" },
  architecture: { "item.N.primary": "nodes.N.label", "item.N.secondary": "nodes.N.description" },
  concept: { "item.N.primary": "points.N.heading", "item.N.secondary": "points.N.description" },
  data: { "item.N.primary": "stats.N.value", "item.N.secondary": "stats.N.label" },
  // A case study runs through the template's four-step process layout, so its
  // four passages address that layout's step slots.
  caseStudy: {
    "item.N.primary": "the stage name (Situation, Problem, Action, Outcome)",
    "item.N.secondary": "situation / problem / action / outcome (each)",
  },
};

/**
 * The text limits a slide's chosen layout imposes, for the generator.
 *
 * Quoted at the layout's fullest item count, which is its tightest geometry —
 * telling the model what fits when a layout holds three items would
 * under-constrain the same layout holding six.
 */
export function contentLimitsFor(type: SlideContent["type"], items: number): string[] {
  const candidates = layoutsFor(type, items);
  const definition = candidates[0] ?? LAYOUTS.find((l) => l.supports.includes(type));
  if (!definition) return [];

  const atCapacity = Math.max(items, definition.capacity.max);
  const layout = definition.build(
    Math.min(Math.max(atCapacity, definition.capacity.min), definition.capacity.max),
    // The tightest case: a slide carrying both a lead and a takeaway band has
    // the least room for its content, and that is the budget to quote.
    { hasLead: true, hasTakeaway: true },
  );

  const rename = SLOT_NAMES[type] ?? {};
  const seen = new Map<string, number>();

  // Synthetic paths are excluded from capacitiesOf, but a case study's four
  // passages are real content and the model needs their limit.
  for (const placeholder of layout.placeholders) {
    const shape = placeholder.path.replace(/\.\d+/g, ".N");
    if (shape.startsWith("__") && !(shape in rename)) continue;

    const named = shape in rename ? rename[shape] : shape;
    if (!named) continue;

    const { maxChars } = capacityOf(placeholder);
    const existing = seen.get(named);
    if (existing === undefined || maxChars < existing) seen.set(named, maxChars);
  }

  return [...seen.entries()].map(([shape, chars]) => `${shape}: at most ${chars} characters`);
}
