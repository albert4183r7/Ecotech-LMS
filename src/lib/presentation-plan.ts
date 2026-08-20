import { z } from "zod/v4";

// ============================================
// Presentation planning
//
// The user controls how many slides they get. The model controls how many
// logical sections the subject needs. These are independent: a five-section
// subject can be told in six slides or in twenty.
//
// The previous design forced one outline entry per slide and then trimmed the
// list to length, which silently deleted whole sections. Nothing here deletes
// a section; budgets are redistributed, and sections are merged only when
// there are genuinely fewer slides than sections.
// ============================================

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 30;

export const PlannedSectionSchema = z.object({
  title: z.string().min(3).max(90).describe("What this part of the presentation covers"),
  summary: z
    .string()
    .min(20)
    .max(400)
    .describe("What the audience should understand after this section"),
  subtopics: z
    .array(z.string().min(5).max(160))
    .min(2)
    .max(8)
    .describe("The specific points this section must teach, concrete enough to review"),
  slideBudget: z
    .number()
    .int()
    .min(1)
    .max(12)
    .describe("How many slides this section needs, proportional to its depth"),
});

export const PresentationPlanSchema = z.object({
  title: z.string().min(3).max(120).describe("Title of the whole presentation"),
  subtitle: z.string().min(3).max(160).describe("One line describing what it covers"),
  sections: z.array(PlannedSectionSchema).min(1).max(12),
});

export type PlannedSection = z.infer<typeof PlannedSectionSchema>;
export type PresentationPlan = z.infer<typeof PresentationPlanSchema>;

// ────────────────────────────────────────────────
// Repair
//
// Grounding the plan in a source document makes the model write longer, more
// specific subtopics — which is the point, but it pushed them past the 160
// character cap and failed validation outright. Raising the cap would only
// move the problem and would let a paragraph masquerade as a bullet, so
// over-long values are reshaped into ones the schema accepts instead.
// ────────────────────────────────────────────────

const SUBTOPIC_MAX = 160;
const SUBTOPIC_MIN = 5;
const SUMMARY_MAX = 400;
const TITLE_MAX = 90;
const MAX_SUBTOPICS = 8;

/** Words that read as broken when a trimmed value ends on them. */
const DANGLING =
  /\s+(?:a|an|the|and|or|but|of|to|in|on|at|by|for|from|with|as|is|are|was|were|be|been|that|which|than|into|onto|over|under|about|instead|rather|because|so|its|their|his|her|this|these|those)$/i;

/** Cut at the last word boundary that fits, so a value never ends mid-word or
 *  on a word that leaves the reader waiting for the rest of the sentence. */
function trimToWord(text: string, limit: number): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  let out = (lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, "");
  // A trailing preposition or article can survive several times over
  // ("... instead of on the"), so keep going until the value ends on a word
  // that can carry the end of a point.
  let guard = 0;
  while (DANGLING.test(out) && guard++ < 6) {
    out = out.replace(DANGLING, "").replace(/[\s,;:—-]+$/, "");
  }
  return out;
}

/**
 * Turn one over-long subtopic into one or more that fit.
 *
 * Splitting on sentence and clause boundaries keeps every point the model
 * made; only when a single clause is itself too long does anything get cut.
 */
function splitSubtopic(text: string): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= SUBTOPIC_MAX) return [clean];

  // Sentences first, then clause separators, so the split lands somewhere
  // that still reads as a complete point.
  for (const pattern of [
    /(?<=[.!?])\s+/,
    /\s*[;·•]\s*/,
    /\s+[–—]\s+/,
    /,\s+(?=(?:and|which|so|because)\b)/i,
  ]) {
    const parts = clean
      .split(pattern)
      .map((p) => p.trim().replace(/^[,;\s]+/, ""))
      .filter((p) => p.length >= SUBTOPIC_MIN);
    if (parts.length > 1 && parts.every((p) => p.length <= SUBTOPIC_MAX)) return parts;
    if (parts.length > 1)
      return parts.flatMap((p) => (p.length > SUBTOPIC_MAX ? [trimToWord(p, SUBTOPIC_MAX)] : [p]));
  }

  return [trimToWord(clean, SUBTOPIC_MAX)];
}

/**
 * Coerce a model response into the shape the schema accepts.
 *
 * Runs before validation, so a predictable overrun costs nothing instead of
 * consuming a retry. Anything it cannot fix is left for the schema to reject.
 */
export function repairPlan(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const plan = parsed as Record<string, unknown>;

  if (typeof plan.title === "string") plan.title = trimToWord(plan.title, 120);
  if (typeof plan.subtitle === "string") plan.subtitle = trimToWord(plan.subtitle, 160);

  if (!Array.isArray(plan.sections)) return plan;

  plan.sections = plan.sections.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const section = raw as Record<string, unknown>;

    if (typeof section.title === "string") section.title = trimToWord(section.title, TITLE_MAX);
    if (typeof section.summary === "string") {
      section.summary = trimToWord(section.summary, SUMMARY_MAX);
    }

    if (Array.isArray(section.subtopics)) {
      const expanded = section.subtopics
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .flatMap(splitSubtopic)
        .filter((t) => t.length >= SUBTOPIC_MIN);
      // Splitting can push a section past the item cap; keeping the first
      // eight loses least, because the model orders points by importance.
      section.subtopics = expanded.slice(0, MAX_SUBTOPICS);
    }

    return section;
  });

  return plan;
}

/** A plan whose budgets are guaranteed to sum to the requested slide count. */
export interface BalancedPlan extends PresentationPlan {
  totalSlides: number;
  /** Human-readable notes about what balancing had to change. */
  adjustments: string[];
}

/** Merge two sections into one, preserving every subtopic from both.
 *  No cap here: trimming the list would silently drop reviewed content, which
 *  is the failure this whole module exists to prevent. A crowded merged
 *  section is compressed when its slides are written, not before. */
function mergeSections(a: PlannedSection, b: PlannedSection): PlannedSection {
  const subtopics = [...a.subtopics, ...b.subtopics];
  return {
    title: `${a.title} & ${b.title}`.slice(0, 90),
    summary: `${a.summary} ${b.summary}`.slice(0, 400),
    subtopics,
    slideBudget: 1,
  };
}

/**
 * Force a plan's slide budgets to sum to exactly `requested`.
 *
 * Order of operations matters:
 *  1. If there are more sections than slides, merge the least demanding
 *     neighbours until they fit. Merging keeps their content; deleting would
 *     lose it.
 *  2. Give every surviving section at least one slide.
 *  3. Add or remove the remainder from the sections that can best afford it,
 *     largest first when trimming, so no section is reduced below one.
 */
export function balancePlan(plan: PresentationPlan, requested: number): BalancedPlan {
  const target = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(requested)));
  const adjustments: string[] = [];
  let sections = plan.sections.map((s) => ({ ...s }));

  // 1. Too many sections to give each one a slide: merge, never drop.
  while (sections.length > target) {
    let bestIndex = 0;
    let bestWeight = Infinity;
    for (let i = 0; i < sections.length - 1; i++) {
      const weight = sections[i].subtopics.length + sections[i + 1].subtopics.length;
      if (weight < bestWeight) {
        bestWeight = weight;
        bestIndex = i;
      }
    }
    const merged = mergeSections(sections[bestIndex], sections[bestIndex + 1]);
    adjustments.push(
      `Merged "${sections[bestIndex].title}" and "${sections[bestIndex + 1].title}" to fit ${target} slides`,
    );
    sections.splice(bestIndex, 2, merged);
  }

  // 2. Everything gets at least one slide.
  sections = sections.map((s) => ({ ...s, slideBudget: Math.max(1, Math.round(s.slideBudget)) }));

  // 3. Reconcile the remainder.
  const sum = () => sections.reduce((n, s) => n + s.slideBudget, 0);

  let guard = 0;
  while (sum() > target && guard++ < 500) {
    // Take from the section with the most slides; never take its last one.
    const index = sections.reduce(
      (best, s, i) => (s.slideBudget > sections[best].slideBudget ? i : best),
      0,
    );
    if (sections[index].slideBudget <= 1) break;
    sections[index].slideBudget--;
  }

  guard = 0;
  while (sum() < target && guard++ < 500) {
    // Give to the section with the most subtopics per slide — the one carrying
    // the most content for the space it has.
    const index = sections.reduce(
      (best, s, i) =>
        s.subtopics.length / s.slideBudget >
        sections[best].subtopics.length / sections[best].slideBudget
          ? i
          : best,
      0,
    );
    sections[index].slideBudget++;
  }

  const total = sum();
  if (total !== target) {
    adjustments.push(`Could not reach ${target} slides exactly; plan totals ${total}`);
  }

  // Say so when the budget forces heavy compression, rather than letting the
  // user discover it in the finished deck.
  for (const section of sections) {
    const perSlide = section.subtopics.length / section.slideBudget;
    if (perSlide > 5) {
      adjustments.push(
        `"${section.title}" carries ${section.subtopics.length} points across ${section.slideBudget} slide(s); content will be condensed`,
      );
    }
  }

  return { ...plan, sections, totalSlides: total, adjustments };
}

/** One slide's place in the finished deck, derived from the balanced plan. */
export interface SlideSlot {
  /** 0-based position across the whole presentation. */
  index: number;
  sectionIndex: number;
  sectionTitle: string;
  /** 1-based position within its own section. */
  positionInSection: number;
  slidesInSection: number;
  /** Subtopics this particular slide is responsible for. */
  subtopics: string[];
  role: "cover" | "section-opener" | "content" | "closing";
}

/**
 * Expand a balanced plan into one slot per slide.
 *
 * Each section's subtopics are dealt across its slides, so every subtopic the
 * user reviewed lands on exactly one slide and nothing is silently dropped.
 */
export function buildSlideSlots(plan: BalancedPlan): SlideSlot[] {
  const slots: SlideSlot[] = [];
  let index = 0;

  plan.sections.forEach((section, sectionIndex) => {
    const budget = section.slideBudget;
    const perSlide: string[][] = Array.from({ length: budget }, () => []);
    section.subtopics.forEach((topic, i) => perSlide[i % budget].push(topic));

    for (let i = 0; i < budget; i++) {
      const isFirstOverall = index === 0;
      slots.push({
        index,
        sectionIndex,
        sectionTitle: section.title,
        positionInSection: i + 1,
        slidesInSection: budget,
        subtopics: perSlide[i],
        role: isFirstOverall ? "cover" : i === 0 && budget > 1 ? "section-opener" : "content",
      });
      index++;
    }
  });

  if (slots.length > 1) slots[slots.length - 1].role = "closing";
  return slots;
}

/** The plan as persisted in `Lesson.outlineJson`. */
export interface StoredOutline {
  topic?: string;
  style?: string;
  slideCount?: number;
  language?: string;
  title?: string;
  subtitle?: string;
  sections?: PlannedSection[];
  adjustments?: string[];
  referenceContext?: string;
  referenceSources?: { file: string; charCount: number }[];
  referenceFailures?: { file: string; reason: string }[];
}
