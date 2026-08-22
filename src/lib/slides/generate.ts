import { generateStructuredJSON } from "@/lib/ai";
import { contentWeight, type SlideContent } from "./content-schema";
import { SlideDraftSchema, draftToContent } from "./draft";
import { LAYOUTS } from "./template-layouts";
import { contentLimitsFor } from "./layout-select";

// ============================================
// Slide content generation
//
// One structured call per slide. The model returns typed content, never HTML,
// so a thin answer fails validation instead of becoming a slide with a large
// empty area.
// ============================================

export interface SlideBrief {
  /** 1-based position in the finished deck. */
  position: number;
  totalSlides: number;
  presentationTitle: string;
  presentationSubtitle: string;
  sectionTitle: string;
  sectionSummary: string;
  /** The reviewed points this slide is responsible for. */
  subtopics: string[];
  role: "cover" | "section-opener" | "content" | "closing";
  language: string;
  /** What earlier slides already said, so nothing is repeated. */
  alreadyCovered?: string;
  referenceText?: string;
  /**
   * Problems a reviewer found with this slide's previous attempt.
   *
   * Present only on a revision. Quoting the specific fault is what makes a
   * second attempt different from a re-roll of the first.
   */
  revisionNotes?: string[];
}

const SYSTEM = `You write the content of one presentation slide.

You return structured content, not HTML and not prose. Put the substance in
"blocks"; each block is one part of the slide. Pick the "type" that suits what
this slide has to teach:

- concept: an idea broken into named parts
- comparison: two or three things set against each other
- process: an ordered sequence of steps
- architecture: how components connect, as a flow
- caseStudy: a concrete situation, its problem, the action, the outcome
- data: figures, only when the figures come from supplied source material
- summary: the points worth remembering
- title / closing: reserved for the first and last slides

Rules:
- Teach the subject. Never describe the presentation or what the audience will do.
- Write in full, informative sentences. A heading plus four vague words is not content.
- Do not repeat anything listed as already covered.
- Vary the type across a deck. Consecutive slides of the same type read as filler.
- Statistics, percentages, currency amounts, dates and named studies may only be
  used when they appear in the supplied source material. With no source, make
  the point qualitatively.
- Write every string in the requested language.
- Every block needs a heading and either a body sentence or supporting items.
  A heading alone is not content.
- Write to the length the layout allows. The limits below are not style advice:
  the template's boxes are a fixed size, and text past them is cut. Aim comfortably
  under each limit rather than at it.
- For a comparison, each block is one side. For a process or architecture, each
  block is one step or component in order. For a case study, use four blocks
  headed Situation, Problem, Action and Outcome. For a summary, put the
  takeaways in one block's items.`;

function buildPrompt(brief: SlideBrief): string {
  const roleLine =
    brief.role === "cover"
      ? `This is slide 1: the opening title slide. Use type "title".`
      : brief.role === "closing"
        ? `This is the final slide. Use type "closing" or "summary".`
        : brief.role === "section-opener"
          ? `This slide opens the section "${brief.sectionTitle}".`
          : `This slide continues the section "${brief.sectionTitle}".`;

  return [
    `PRESENTATION: ${brief.presentationTitle} — ${brief.presentationSubtitle}`,
    `SLIDE ${brief.position} of ${brief.totalSlides}.`,
    roleLine,
    "",
    `SECTION: ${brief.sectionTitle}`,
    `What this section must achieve: ${brief.sectionSummary}`,
    "",
    brief.subtopics.length
      ? `THIS SLIDE MUST COVER:\n${brief.subtopics.map((t) => `- ${t}`).join("\n")}`
      : "This slide frames the presentation rather than carrying detailed points.",
    brief.alreadyCovered
      ? `\nALREADY COVERED BY EARLIER SLIDES — do not restate:\n${brief.alreadyCovered}`
      : "",
    brief.referenceText
      ? `\nSOURCE MATERIAL. Every figure must come from here:\n<reference>\n${brief.referenceText.slice(0, 6000)}\n</reference>`
      : "\nNo source material was supplied, so use no statistics.",
    brief.revisionNotes?.length
      ? `\nA REVIEWER REJECTED YOUR PREVIOUS VERSION OF THIS SLIDE:\n${brief.revisionNotes
          .map((note) => `- ${note}`)
          .join(
            "\n",
          )}\n\nWrite it again, fixing exactly these problems. Keep what was not criticised.`
      : "",
    "",
    `LANGUAGE: write all text in ${brief.language}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * What the template's boxes can actually hold, for this slide.
 *
 * Derived from the layout geometry rather than asserted, so the limits the
 * generator is given and the limits the renderer enforces are the same
 * numbers. Without this the model wrote to the schema's maxima, which are
 * larger than the template's boxes, and the surplus was trimmed at render.
 */
function layoutBudget(brief: SlideBrief): string {
  // The generator has not chosen a type yet, so quote the limits of every
  // layout it might land in, keyed by type.
  const lines: string[] = ["CONTENT LIMITS — the template's boxes are this size:"];

  for (const definition of LAYOUTS) {
    for (const type of definition.supports) {
      const items = Math.min(Math.max(3, definition.capacity.min), definition.capacity.max);
      const limits = contentLimitsFor(type, items);
      if (limits.length === 0) continue;
      lines.push(
        `- ${type} (${definition.capacity.min}-${definition.capacity.max} items): ${limits.join("; ")}`,
      );
      break;
    }
  }

  return lines.join("\n");
}

/** Content thinner than this is treated as a failed generation. */
const MIN_CONTENT_WEIGHT = 120;

/**
 * Generate one slide's content, retrying when the model returns something too
 * thin to fill a slide. Thin output was the visible symptom of the old design;
 * here it is a failure condition rather than something that reaches the deck.
 */
export async function generateSlideContent(brief: SlideBrief): Promise<SlideContent> {
  let last: SlideContent | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    // A flat draft, not the typed union: Gemini's structured output does not
    // handle a top-level oneOf reliably, and every non-title slide failed.
    const draft = await generateStructuredJSON(buildPrompt(brief), SlideDraftSchema, {
      task: "slide-authoring",
      systemInstruction: `${SYSTEM}\n\n${layoutBudget(brief)}`,
      temperature: attempt === 1 ? 0.6 : 0.8,
    });
    const content = draftToContent(draft);

    last = content;
    const weight = contentWeight(content);
    const floor = brief.role === "cover" || brief.role === "closing" ? 40 : MIN_CONTENT_WEIGHT;
    if (weight >= floor) return content;

    console.warn(
      `[slide-content] slide ${brief.position} came back thin (${weight} chars), retrying`,
    );
  }

  if (!last) throw new Error(`slide ${brief.position}: no content produced`);
  return last;
}

/** A short digest of a finished slide, to stop the next one repeating it. */
export function summariseForContext(content: SlideContent): string {
  switch (content.type) {
    case "title":
    case "closing":
      return content.title;
    case "concept":
      return `${content.title}: ${content.points.map((p) => p.heading).join(", ")}`;
    case "comparison":
      return `${content.title}: ${content.columns.map((c) => c.heading).join(" vs ")}`;
    case "process":
      return `${content.title}: ${content.steps.map((s) => s.label).join(" → ")}`;
    case "architecture":
      return `${content.title}: ${content.nodes.map((n) => n.label).join(" → ")}`;
    case "caseStudy":
      return `${content.title}: case study`;
    case "data":
      return `${content.title}: ${content.stats.map((s) => s.label).join(", ")}`;
    case "summary":
      return `${content.title}: ${content.takeaways.length} takeaways`;
  }
}
