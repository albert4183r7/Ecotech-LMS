import { z } from "zod/v4";

// ============================================
// Lesson outline contract
//
// The outline stage used to emit prose stage-directions ("Begin with a
// compelling hook about...", "This slide will explain..."). The slide stage
// then had to invent every fact itself, which is where fabricated statistics
// and generic filler came from.
//
// The shape below forces the outline stage to emit the *content* that goes on
// the slide, not a description of what someone should write.
// ============================================

/** Hard cap on a slide title.
 *  Observed failure: the model swapped `title` and `outline`, putting a
 *  389-character paragraph into `title`, which then became the slide's name in
 *  the lesson list. Both the schema and `repairOutlineResponse` enforce this. */
export const MAX_SLIDE_TITLE_CHARS = 80;

export const MIN_KEY_POINTS = 2;
export const MAX_KEY_POINTS = 5;
export const MAX_TERMS = 6;

// ────────────────────────────────────────────────
// Schemas (validated on the LLM response)
// ────────────────────────────────────────────────

export const SlideOutlineSchema = z.object({
  slideNumber: z.number().int().min(1),
  title: z.string().min(3).max(MAX_SLIDE_TITLE_CHARS),
  /** The actual statements that appear on the slide — not instructions. */
  keyPoints: z.array(z.string().min(10).max(220)).min(MIN_KEY_POINTS).max(MAX_KEY_POINTS),
  /** Specific named things to mention: technologies, standards, examples. */
  terms: z.array(z.string().min(1).max(60)).max(MAX_TERMS),
  /** How to arrange the slide visually. */
  layout: z.string().min(10).max(240),
});

export const OutlineResponseSchema = z.object({
  lessonTitle: z.string().min(3).max(120),
  slides: z.array(SlideOutlineSchema).min(1),
});

export type SlideOutline = z.infer<typeof SlideOutlineSchema>;
export type OutlineResponse = z.infer<typeof OutlineResponseSchema>;

/** Shape as persisted in `Lesson.outlineJson`.
 *  `outline` is the legacy prose field — lessons generated before this contract
 *  still carry it, and slide generation must keep working for them. */
export interface StoredSlideOutline {
  slideNumber?: number;
  title: string;
  keyPoints?: string[];
  terms?: string[];
  layout?: string;
  outline?: string;
}

export interface StoredOutline {
  topic: string;
  style: string;
  slideCount?: number;
  language?: string;
  slides: StoredSlideOutline[];
  referenceContext?: string;
  referenceSources?: { file: string; charCount: number }[];
}

// ────────────────────────────────────────────────
// Repair — runs on the parsed JSON *before* schema validation
// ────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Trim a title to the cap on a word boundary, without adding an ellipsis. */
export function truncateTitle(title: string, max = MAX_SLIDE_TITLE_CHARS): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.\-–—]+$/, "");
}

/** Split prose into sentence-sized points, for repairing a legacy `outline`. */
function proseToKeyPoints(prose: string): string[] {
  return prose
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 10)
    .slice(0, MAX_KEY_POINTS);
}

/**
 * Coerce a single slide entry into the current contract.
 *
 * Handles the two failure modes seen in generated data:
 *  - `title` and `outline` arriving swapped (paragraph in `title`)
 *  - the model answering in the legacy prose shape instead of `keyPoints`
 */
export function repairSlideEntry(raw: unknown, index: number): unknown {
  if (!isRecord(raw)) return raw;
  const entry = { ...raw };

  let title = asString(entry.title);
  const legacyOutline = asString(entry.outline);

  // Swapped fields: a paragraph in `title` and a heading in `outline`.
  if (
    title.length > MAX_SLIDE_TITLE_CHARS &&
    legacyOutline &&
    legacyOutline.length <= MAX_SLIDE_TITLE_CHARS
  ) {
    entry.title = legacyOutline;
    entry.outline = title;
    title = legacyOutline;
  }

  if (title.length > MAX_SLIDE_TITLE_CHARS) {
    entry.title = truncateTitle(title);
  }

  // Legacy prose shape → key points.
  if (!Array.isArray(entry.keyPoints)) {
    const source = asString(entry.outline);
    entry.keyPoints = source ? proseToKeyPoints(source) : [];
  }

  if (!Array.isArray(entry.terms)) entry.terms = [];
  if (!asString(entry.layout)) {
    entry.layout = "Title at the top with the key points as separate visual blocks below.";
  }

  entry.slideNumber = index + 1;
  return entry;
}

/** Repair callback for `generateStructuredJSON`. */
export function repairOutlineResponse(parsed: unknown): unknown {
  if (!isRecord(parsed)) return parsed;
  if (!Array.isArray(parsed.slides)) return parsed;
  return {
    ...parsed,
    slides: parsed.slides.map((entry, i) => repairSlideEntry(entry, i)),
  };
}

// ────────────────────────────────────────────────
// Slide count enforcement
// ────────────────────────────────────────────────

/**
 * Force the outline to the requested slide count.
 *
 * The model does not reliably honour the count (a 3-slide request came back
 * with 4). Extra slides are dropped from the middle so the title slide and the
 * closing slide — which the prompt positions explicitly — always survive.
 */
export function enforceSlideCount<T>(
  slides: T[],
  requested: number,
): { slides: T[]; warning?: string } {
  if (slides.length === requested) return { slides };

  if (slides.length < requested) {
    return {
      slides,
      warning: `outline returned ${slides.length} slides, ${requested} were requested`,
    };
  }

  if (requested <= 2) {
    return {
      slides: slides.slice(0, requested),
      warning: `outline returned ${slides.length} slides, trimmed to ${requested}`,
    };
  }

  const middle = slides.slice(1, -1).slice(0, requested - 2);
  return {
    slides: [slides[0], ...middle, slides[slides.length - 1]],
    warning: `outline returned ${slides.length} slides, trimmed to ${requested}`,
  };
}

// ────────────────────────────────────────────────
// Reading an outline back out (legacy-tolerant)
// ────────────────────────────────────────────────

export interface SlideBrief {
  keyPoints: string[];
  terms: string[];
  layout: string;
}

/** Read a stored outline entry in either the current or the legacy shape. */
export function slideBrief(entry: StoredSlideOutline | undefined): SlideBrief {
  if (!entry) return { keyPoints: [], terms: [], layout: "" };

  const keyPoints =
    Array.isArray(entry.keyPoints) && entry.keyPoints.length > 0
      ? entry.keyPoints
      : proseToKeyPoints(entry.outline ?? "");

  return {
    keyPoints,
    terms: Array.isArray(entry.terms) ? entry.terms : [],
    layout: entry.layout ?? "",
  };
}

// ────────────────────────────────────────────────
// Prior-slide context
// ────────────────────────────────────────────────

/** Strip a generated slide document down to its visible text. */
export function extractSlideText(html: string): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return (body ? body[1] : html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Max characters of "already covered" context fed into a slide prompt. */
export const MAX_COVERED_CONTEXT_CHARS = 1400;

/**
 * Build the "already covered" digest.
 *
 * Slides were previously generated in complete isolation — each prompt carried
 * only the neighbouring slide *titles* — so the model re-derived the same
 * definitions on slide after slide. This gives it a view of what it already
 * wrote.
 */
export function buildCoveredContext(covered: { title: string; text: string }[]): string {
  const lines: string[] = [];
  let used = 0;

  for (const item of covered) {
    const summary = item.text.slice(0, 180).trim();
    if (!summary) continue;
    const line = `- "${item.title}": ${summary}`;
    if (used + line.length > MAX_COVERED_CONTEXT_CHARS) break;
    lines.push(line);
    used += line.length;
  }

  return lines.join("\n");
}
