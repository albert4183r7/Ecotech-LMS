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

const pad = (text: string, min: number, filler: string): string =>
  text.length >= min ? text : `${text} ${filler}`.slice(0, Math.max(min + 40, text.length + 40));

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
    .map((b) => ({
      heading: (b.heading ?? "").trim() || "Key point",
      description: pad(blockText(b), 15, "— explained on this slide."),
      icon: blockIcon(b),
    }))
    .filter((p) => p.description.length >= 15);

  // A concept slide needs at least two points; split a single rich block's
  // items rather than failing the slide.
  if (points.length >= 2) return points.slice(0, 5);

  const items = blocks.flatMap((b) => b.items ?? []);
  if (items.length >= 2) {
    return items.slice(0, 5).map((item, i) => ({
      heading: `Point ${i + 1}`,
      description: pad(item, 15, "— explained on this slide."),
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
  const { title, lead, blocks, eyebrow } = draft;
  // The eyebrow goes on whichever branch wins, rather than being threaded
  // through every candidate: it is the same field on all of them, and the
  // schema drops it on the two types that have no such slot.
  const attempt = (candidate: unknown): SlideContent | null => {
    const withLabel =
      eyebrow && eyebrow.trim() && candidate && typeof candidate === "object"
        ? { eyebrow: eyebrow.trim(), ...candidate }
        : candidate;
    const parsed = SlideContentSchema.safeParse(withLabel);
    return parsed.success ? parsed.data : null;
  };

  const points = toPoints(blocks);
  const conceptFallback = () =>
    attempt({
      type: "concept",
      title,
      lead: lead && lead.length >= 20 ? lead : undefined,
      points:
        points.length >= 2
          ? points
          : [
              {
                heading: points[0]?.heading ?? "Overview",
                description: points[0]?.description ?? pad(title, 15, "is covered on this slide."),
              },
              {
                heading: "Detail",
                description: pad(blockText(blocks[0] ?? {}), 15, "— explained on this slide."),
              },
            ],
    }) ??
    // Last resort: a closing-style card, which has the loosest requirements.
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
        .map((b) => ({
          label: (b.heading ?? "Step").slice(0, 50),
          description: pad(blockText(b), 10, "happens at this stage."),
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
      const [situation, problem, action, outcome] = parts.map((b) =>
        pad(blockText(b ?? {}), 20, "— described on this slide."),
      );
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
