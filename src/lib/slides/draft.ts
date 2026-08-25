import { z } from "zod/v4";
import { SlideContentSchema, type SlideContent, type SlideType } from "./content-schema";

// ============================================
// Flat slide draft
//
// The typed content model is a nine-branch discriminated union, which becomes
// a top-level `oneOf` in JSON Schema. Gemini's structured output does not
// handle that reliably: in practice only the simplest branch came back valid,
// so a deck produced one good title slide and a row of failures.
//
// The model is asked for this flat shape instead — one object, no union — and
// the result is narrowed to typed content here, where a shortfall can fall
// back to a simpler layout rather than failing the slide.
// ============================================

export const SlideBlockSchema = z.object({
  heading: z.string().max(70).optional().describe("A few words naming this part"),
  body: z.string().max(300).optional().describe("A full sentence explaining it"),
  items: z.array(z.string().max(180)).max(6).optional().describe("Short supporting points"),
  icon: z
    .string()
    .max(24)
    .optional()
    .describe("Name of an icon that suits this part; see the list in the instructions"),
});

export const SLIDE_TYPES = [
  "title",
  "concept",
  "comparison",
  "process",
  "architecture",
  "caseStudy",
  "data",
  "summary",
  "closing",
] as const;

export const SlideDraftSchema = z.object({
  type: z.enum(SLIDE_TYPES).describe("The shape that suits what this slide teaches"),
  eyebrow: z
    .string()
    .max(40)
    .optional()
    .describe("Short label naming the part of the lesson this slide belongs to"),
  title: z.string().min(3).max(90),
  subtitle: z.string().max(180).optional().describe("Used by title and closing slides"),
  lead: z.string().max(280).optional().describe("One sentence framing the slide"),
  takeaway: z
    .string()
    .max(115)
    .optional()
    .describe(
      "One sentence: what the audience should carry away. The point of the slide, not a summary of it",
    ),
  blocks: z
    .array(SlideBlockSchema)
    .min(1)
    .max(6)
    .describe(
      "The substance of the slide. For a comparison each block is one side; for a process each block is a step; for a case study use four blocks headed Situation, Problem, Action, Outcome.",
    ),
});

export type SlideDraft = z.infer<typeof SlideDraftSchema>;
export type SlideBlock = z.infer<typeof SlideBlockSchema>;

// ────────────────────────────────────────────────
// Narrowing helpers
// ────────────────────────────────────────────────

/**
 * Whether a block said enough to be worth a slot.
 *
 * Short blocks used to be padded up to the schema's minimum with a canned
 * phrase — "— explained on this slide." reached real decks. Padding also
 * inflated the content-weight check that is supposed to catch a thin slide and
 * regenerate it, so the filler hid the very problem it was papering over.
 * Thin blocks are now dropped, and a slide left with too little fails to
 * narrow and is regenerated instead.
 */
const substantial = (text: string, min: number): boolean => text.trim().length >= min;

/**
 * An icon name the typed schema will accept.
 *
 * The schema caps it at 24 characters; an over-long invented name would fail
 * validation and cost the slide its whole layout, when an unknown name is
 * meant to fall back to a sensible icon instead.
 */
function blockIcon(block: SlideBlock): string | undefined {
  return block.icon?.trim().slice(0, 24) || undefined;
}

/** Everything a block can contribute as prose. */
function blockText(block: SlideBlock): string {
  if (block.body?.trim()) return block.body.trim();
  if (block.items?.length) return block.items.join(". ");
  return block.heading?.trim() ?? "";
}

function toPoints(blocks: SlideBlock[]): {
  heading: string;
  description: string;
  icon?: string;
}[] {
  const points = blocks
    .filter((b) => substantial(blockText(b), 15))
    .map((b) => ({
      heading: (b.heading ?? "").trim() || "Key point",
      description: blockText(b),
      icon: blockIcon(b),
    }));

  // A concept slide needs at least two points; split a single rich block's
  // items rather than failing the slide.
  if (points.length >= 2) return points.slice(0, 5);

  const items = blocks.flatMap((b) => b.items ?? []);
  const usable = items.filter((item) => substantial(item, 15));
  if (usable.length >= 2) {
    return usable.slice(0, 5).map((item, i) => ({
      heading: `Point ${i + 1}`,
      description: item.trim(),
    }));
  }
  return points;
}

/**
 * Convert a draft into valid typed content.
 *
 * When the chosen type cannot be satisfied by what the model actually returned,
 * it degrades to a simpler layout that can be. A slide always comes out of this
 * function; nothing is dropped for want of a field.
 */
export function draftToContent(
  draft: SlideDraft,
  fallbackType: SlideType = "concept",
): SlideContent {
  const { title, lead, blocks, eyebrow, takeaway } = draft;
  // The eyebrow and the takeaway go on whichever branch wins, rather than
  // being threaded through every candidate: they are the same field on all of
  // them, and the schema drops them on the types that have no such slot.
  const attempt = (candidate: unknown): SlideContent | null => {
    if (!candidate || typeof candidate !== "object") return null;
    const extras: Record<string, string> = {};
    if (eyebrow?.trim()) extras.eyebrow = eyebrow.trim();
    if (takeaway && takeaway.trim().length >= 15) extras.takeaway = takeaway.trim();
    const parsed = SlideContentSchema.safeParse({ ...extras, ...candidate });
    return parsed.success ? parsed.data : null;
  };

  const points = toPoints(blocks);
  const conceptFallback = () =>
    (points.length >= 2
      ? attempt({
          type: "concept",
          title,
          lead: lead && lead.length >= 20 ? lead : undefined,
          points,
        })
      : null) ??
    // Last resort: a closing-style card, which has the loosest requirements.
    // A slide that lands here is thin, and the caller's weight check will see
    // that and generate it again rather than shipping the shortfall.
    (attempt({ type: "closing", title, subtitle: lead ?? draft.subtitle }) as SlideContent);

  switch (draft.type) {
    case "title":
      return (
        attempt({
          type: "title",
          title,
          subtitle: draft.subtitle ?? lead ?? blockText(blocks[0] ?? {}),
        }) ?? conceptFallback()
      );

    case "closing":
      return (
        attempt({ type: "closing", title, subtitle: draft.subtitle ?? lead }) ?? conceptFallback()
      );

    case "comparison": {
      const columns = blocks
        .filter((b) => (b.items?.length ?? 0) >= 2 || (b.body?.length ?? 0) > 0)
        .slice(0, 3)
        .map((b) => ({
          heading: (b.heading ?? "Option").slice(0, 50),
          points: (b.items?.length ? b.items : [b.body ?? ""])
            .filter((p) => p.trim().length >= 8)
            .slice(0, 5),
          icon: blockIcon(b),
        }))
        .filter((c) => c.points.length >= 2);
      return attempt({ type: "comparison", title, lead, columns }) ?? conceptFallback();
    }

    case "process": {
      const steps = blocks
        .filter((b) => substantial(blockText(b), 10))
        .map((b) => ({
          label: (b.heading ?? "Step").slice(0, 50),
          description: blockText(b),
          icon: blockIcon(b),
        }))
        .slice(0, 6);
      return attempt({ type: "process", title, lead, steps }) ?? conceptFallback();
    }

    case "architecture": {
      const nodes = blocks
        .map((b) => ({
          label: (b.heading ?? "Component").slice(0, 46),
          description: blockText(b).slice(0, 140) || undefined,
          icon: blockIcon(b),
        }))
        .slice(0, 6);
      return attempt({ type: "architecture", title, lead, nodes }) ?? conceptFallback();
    }

    case "caseStudy": {
      const byHeading = (needle: string) =>
        blocks.find((b) => (b.heading ?? "").toLowerCase().includes(needle));
      const parts = [
        byHeading("situation") ?? blocks[0],
        byHeading("problem") ?? blocks[1],
        byHeading("action") ?? blocks[2],
        byHeading("outcome") ?? blocks[3],
      ];
      // Every stage has to have been written. A case study missing its outcome
      // is not a case study, so it narrows to a concept slide instead of
      // shipping a stage that says nothing.
      const [situation, problem, action, outcome] = parts.map((b) => blockText(b ?? {}));
      return (
        attempt({ type: "caseStudy", title, situation, problem, action, outcome }) ??
        conceptFallback()
      );
    }

    case "data": {
      // Only accept figures that look like figures; otherwise this is prose
      // wearing a chart's clothing.
      const stats = blocks
        .map((b) => {
          const match = /(\d[\d.,]*\s*%?|\d+x)/.exec(b.heading ?? b.body ?? "");
          return match
            ? {
                value: match[1].slice(0, 18),
                label:
                  (b.heading ?? b.body ?? "").replace(match[1], "").trim().slice(0, 60) || "Figure",
                note: b.body?.slice(0, 120),
                icon: blockIcon(b),
              }
            : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null && s.label.length >= 3)
        .slice(0, 4);
      return attempt({ type: "data", title, lead, stats }) ?? conceptFallback();
    }

    case "summary": {
      const takeaways = [
        ...blocks.flatMap((b) => b.items ?? []),
        ...blocks.map((b) => b.body ?? ""),
      ]
        .map((t) => t.trim())
        .filter((t) => t.length >= 15)
        .slice(0, 6);
      return attempt({ type: "summary", title, takeaways }) ?? conceptFallback();
    }

    case "concept":
    default:
      return (
        attempt({
          type: fallbackType === "concept" ? "concept" : "concept",
          title,
          lead: lead && lead.length >= 20 ? lead : undefined,
          points,
        }) ?? conceptFallback()
      );
  }
}
