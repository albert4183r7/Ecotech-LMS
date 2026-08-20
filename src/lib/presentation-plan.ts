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
