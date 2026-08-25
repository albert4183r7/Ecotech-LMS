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
  /**
   * What this section asserts.
   *
   * A section title is a topic, and a topic can be filled with definitions.
   * A claim cannot: "the three families differ by what signal is available"
   * commits the section to teaching something, and every slide under it
   * inherits that commitment.
   */
  claim: z
    .string()
    .min(15)
    .max(240)
    .describe("What this section asserts, in one sentence — not what it 'covers'"),
  /**
   * The concrete device that carries the section.
   *
   * Reference decks teach through artefacts — one request walked end to end, a
   * before-and-after table, a failure traced to its cause. Naming the artefact
   * in the plan is what stops the slides beneath it becoming prose.
   */
  vehicle: z
    .string()
    .min(10)
    .max(200)
    .describe("The example, comparison, walkthrough or failure this section teaches through"),
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
  slideTitles: z
    .array(z.string().min(3).max(90))
    .max(12)
    .optional()
    .describe("A real title for each slide in this section, in order — never 'Topic (1/2)'"),
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
  /**
   * Who the lesson is for, decided by the planner and shown to the instructor.
   *
   * The planner always had an audience in mind; it was simply never written
   * down, so nobody could see it was "general business professionals" until
   * the slides came out reading that way.
   */
  audience: z
    .string()
    .min(15)
    .max(300)
    .describe("Who this is for and what they already know, inferred from the request"),
  /** The one thing the audience should still know a week later. */
  thesis: z
    .string()
    .min(20)
    .max(300)
    .describe("The single idea the whole lesson is built to leave them with"),
  /**
   * The vocabulary the lesson has to teach.
   *
   * Training is partly about being able to follow a conversation afterwards,
   * and that means meeting the words other people use. Listing them in the
   * plan makes coverage reviewable: an instructor can see at a glance that the
   * lesson on agents covers RAG and function calling, or that it does not.
   */
  keyTerms: z
    .array(z.string().min(2).max(60))
    .max(24)
    .optional()
    .describe("The real terms this audience will hear elsewhere and must learn to recognise"),
  /** What the audience believes now that the lesson corrects. Optional: not
   *  every subject has one, and an invented one is worse than none. */
  misconception: z
    .string()
    .max(240)
    .optional()
    .describe("What this audience is likely to believe now that the lesson corrects"),
  outcomes: z
    .array(z.string().min(10).max(160))
    .min(2)
    .max(4)
    .describe("What the audience can do afterwards that they could not before"),
  /**
   * What the subject actually needs, which the user's slide budget may not
   * match. Recorded so a syllabus compressed into too few slides is visible
   * rather than silently flattened into definitions.
   */
  recommendedSlides: z
    .number()
    .int()
    .min(MIN_SLIDES)
    .max(MAX_SLIDES)
    .optional()
    .describe("How many slides this subject really needs to be taught properly"),
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
/** Points one section — and therefore one slide — may carry. */
const SUBTOPICS_PER_SLIDE = 5;

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
  // The argued fields overrun the same way subtopics do — a model given room
  // to think about an audience writes a paragraph about them. Reshaping costs
  // nothing; failing validation costs a retry of the whole plan.
  if (typeof plan.audience === "string") plan.audience = trimToWord(plan.audience, 300);
  if (typeof plan.thesis === "string") plan.thesis = trimToWord(plan.thesis, 300);
  if (Array.isArray(plan.keyTerms)) {
    plan.keyTerms = plan.keyTerms
      .filter((t): t is string => typeof t === "string" && t.trim().length >= 2)
      .map((t) => trimToWord(t, 60))
      .slice(0, 24);
  }
  if (typeof plan.misconception === "string") {
    plan.misconception = trimToWord(plan.misconception, 240);
  }
  if (Array.isArray(plan.outcomes)) {
    plan.outcomes = plan.outcomes
      .filter((o): o is string => typeof o === "string" && o.trim().length >= 10)
      .map((o) => trimToWord(o, 160))
      .slice(0, 4);
  }

  if (!Array.isArray(plan.sections)) return plan;

  plan.sections = plan.sections.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const section = raw as Record<string, unknown>;

    if (typeof section.title === "string") section.title = trimToWord(section.title, TITLE_MAX);
    if (typeof section.summary === "string") {
      section.summary = trimToWord(section.summary, SUMMARY_MAX);
    }
    if (typeof section.claim === "string") section.claim = trimToWord(section.claim, 240);
    if (typeof section.vehicle === "string") section.vehicle = trimToWord(section.vehicle, 200);
    if (Array.isArray(section.slideTitles)) {
      const budget = typeof section.slideBudget === "number" ? section.slideBudget : 1;
      section.slideTitles = section.slideTitles
        .filter((t): t is string => typeof t === "string" && t.trim().length >= 3)
        .map((t) => trimToWord(t, TITLE_MAX))
        // One title per slide. Extra titles would silently go unused and read
        // as slides the instructor was promised and never got.
        .slice(0, budget);
    }

    if (Array.isArray(section.subtopics)) {
      const expanded = section.subtopics
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .flatMap(splitSubtopic)
        .filter((t) => t.length >= SUBTOPIC_MIN);
      // Splitting can push a section past the item cap; keeping the first
      // eight loses least, because the model orders points by importance.
      //
      // And no more than three points per slide the section was given. Eight
      // points on one slide is not a dense slide, it is three points and five
      // truncated ones: the boxes are a fixed size, so the surplus is written,
      // shrunk, then cut off mid-sentence. Better to promise what a slide can
      // actually teach.
      // One section is one slide, so this is the cap for a single slide. Five
      // points is already the top of what a slide teaches; past that they are
      // not taught, they are listed.
      section.subtopics = expanded.slice(0, SUBTOPICS_PER_SLIDE);
    }

    return section;
  });

  return plan;
}

/**
 * Slides a deck spends on furniture: the cover, the contents, the closing.
 *
 * A deck of N slides therefore teaches N-3 sections, one section per slide.
 * That is the whole reason this number exists in code rather than in a
 * comment: a lesson asked for ten slides used to plan five sections of two
 * slides each, and the two slides of a section were written from the same
 * summary and the same claim — so they came out saying the same thing twice.
 * One section, one slide, one subject.
 */
export const FURNITURE_SLIDES = 3;

/** Below this, a deck is too short to spend a slide listing its own contents. */
export const CONTENTS_FROM = 6;

/** Slides this deck spends on furniture: cover and closing, plus contents. */
export function furnitureFor(slideCount: number): number {
  return slideCount >= CONTENTS_FROM ? FURNITURE_SLIDES : FURNITURE_SLIDES - 1;
}

/** How many teaching sections a deck of this many slides has room for. */
export function sectionsFor(slideCount: number): number {
  return Math.max(1, slideCount - furnitureFor(slideCount));
}

/** A plan whose budgets are guaranteed to sum to the requested slide count. */
export interface BalancedPlan extends PresentationPlan {
  totalSlides: number;
  /** Whether the deck is long enough to carry a contents slide. */
  hasContents: boolean;
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
    // Both claims survive the merge: a merged section still has to assert
    // both things, and dropping one would quietly discard half the argument.
    claim: `${a.claim} ${b.claim}`.slice(0, 240),
    vehicle: `${a.vehicle}; ${b.vehicle}`.slice(0, 200),
    summary: `${a.summary} ${b.summary}`.slice(0, 400),
    subtopics,
    // The titles no longer describe one slide each, so the slot builder falls
    // back to naming the merged section.
    slideTitles: undefined,
    slideBudget: 1,
  };
}

/**
 * Split one section into two, each teaching its own half of the points.
 *
 * The counterpart of merging: when the planner returns fewer sections than the
 * deck has room for, the alternative is a deck shorter than the user asked
 * for. The halves take the planner's own slide titles where it wrote them,
 * which is why splitting does not produce "Topic (1/2)" — those titles were
 * always written as real titles for real slides.
 */
function splitSection(section: PlannedSection): [PlannedSection, PlannedSection] {
  const mid = Math.ceil(section.subtopics.length / 2);
  const titles = section.slideTitles ?? [];
  return [
    {
      ...section,
      title: (titles[0] ?? section.title).slice(0, 90),
      subtopics: section.subtopics.slice(0, mid),
      slideTitles: undefined,
      slideBudget: 1,
    },
    {
      ...section,
      title: (titles[1] ?? `${section.title}, in practice`).slice(0, 90),
      subtopics: section.subtopics.slice(mid),
      slideTitles: undefined,
      slideBudget: 1,
    },
  ];
}

/** A section can only be split if both halves still have points to teach. */
function splittable(section: PlannedSection): boolean {
  return section.subtopics.length >= 4;
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
  const sectionTarget = sectionsFor(target);
  const adjustments: string[] = [];
  let sections = plan.sections.map((s) => ({ ...s }));

  // 1. More sections than the deck can teach: merge the lightest neighbours.
  //    Merging keeps their content; dropping one would lose it.
  while (sections.length > sectionTarget) {
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

  // 2. Fewer sections than slides: split the fullest one, so the extra slide
  //    teaches its own points rather than restating a neighbour's.
  let guard = 0;
  while (sections.length < sectionTarget && guard++ < 100) {
    const index = sections.reduce(
      (best, s, i) =>
        splittable(s) && s.subtopics.length > (sections[best]?.subtopics.length ?? 0) ? i : best,
      -1,
    );
    if (index < 0 || !splittable(sections[index])) break;
    const [a, b] = splitSection(sections[index]);
    adjustments.push(`Split "${sections[index].title}" so each slide teaches its own points`);
    sections.splice(index, 1, a, b);
  }

  // 3. One section, one slide. The cover, the contents and the closing are the
  //    other three.
  sections = sections.map((s) => ({ ...s, slideBudget: 1 }));

  const hasContents = target >= CONTENTS_FROM;
  const total = sections.length + furnitureFor(target);
  if (total !== target) {
    adjustments.push(
      `The subject divides into ${sections.length} section(s), so the deck is ${total} slides rather than ${target}`,
    );
  }

  // Say so when a slide is being asked to carry more than it can teach, rather
  // than letting the user discover it in the finished deck.
  for (const section of sections) {
    if (section.subtopics.length > 5) {
      adjustments.push(
        `"${section.title}" carries ${section.subtopics.length} points on one slide; the slide will group them`,
      );
    }
  }

  return { ...plan, sections, totalSlides: total, hasContents, adjustments };
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
  role: "cover" | "contents" | "section-opener" | "content" | "closing";
  /** The planner's title for this slide, when it named one. */
  title?: string;
  /** What the section asserts, so the slide knows what it is arguing. */
  sectionClaim: string;
  /** How the section makes its case. */
  sectionVehicle: string;
}

/**
 * Expand a balanced plan into one slot per slide.
 *
 * A deck is a cover, a contents slide, one slide per section, and a closing.
 * Every section's points therefore land on exactly one slide, and no two
 * slides are written from the same section — which is what stopped two slides
 * of one section coming out as near-duplicates of each other.
 */
export function buildSlideSlots(plan: BalancedPlan): SlideSlot[] {
  const slots: SlideSlot[] = [];
  const first = plan.sections[0];
  const last = plan.sections[plan.sections.length - 1];

  slots.push({
    index: 0,
    sectionIndex: 0,
    sectionTitle: first?.title ?? plan.title,
    positionInSection: 1,
    slidesInSection: 1,
    subtopics: [],
    title: plan.title,
    sectionClaim: first?.claim ?? "",
    sectionVehicle: first?.vehicle ?? "",
    role: "cover",
  });

  if (plan.hasContents) {
    slots.push({
      index: 1,
      sectionIndex: 0,
      sectionTitle: first?.title ?? plan.title,
      positionInSection: 1,
      slidesInSection: 1,
      // The contents slide lists what the lesson covers, so its content is
      // the section titles themselves.
      subtopics: plan.sections.map((s) => s.title),
      title: "What this lesson covers",
      sectionClaim: first?.claim ?? "",
      sectionVehicle: first?.vehicle ?? "",
      role: "contents",
    });
  }

  plan.sections.forEach((section, sectionIndex) => {
    slots.push({
      index: slots.length,
      sectionIndex,
      sectionTitle: section.title,
      positionInSection: 1,
      slidesInSection: 1,
      subtopics: section.subtopics,
      title: section.slideTitles?.[0] ?? section.title,
      sectionClaim: section.claim,
      sectionVehicle: section.vehicle,
      role: "content",
    });
  });

  slots.push({
    index: slots.length,
    sectionIndex: Math.max(0, plan.sections.length - 1),
    sectionTitle: last?.title ?? plan.title,
    positionInSection: 1,
    slidesInSection: 1,
    subtopics: [],
    title: "What to take away",
    sectionClaim: last?.claim ?? "",
    sectionVehicle: last?.vehicle ?? "",
    role: "closing",
  });

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
