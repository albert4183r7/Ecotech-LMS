import { generateStructuredJSON } from "@/lib/ai";
import { SLIDE_CRAFT, SLIDE_EXEMPLARS } from "./craft";
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
  /** Who the lesson is for, as the plan named them. */
  audience?: string;
  /** The one claim the whole lesson makes. */
  thesis?: string;
  /** What the audience believes now that the lesson corrects. */
  misconception?: string;
  /** The lesson's vocabulary, so terminology stays consistent across slides. */
  keyTerms?: string[];
  /** The title the plan gave this slide, which the instructor has reviewed. */
  plannedTitle?: string;
  /** Where this slide sits inside its section, so two slides of one section
   *  do not both write the section's opening. */
  positionInSection?: number;
  slidesInSection?: number;
  /** What this section asserts — the reason it exists. */
  sectionClaim?: string;
  /** How the section makes its case: the example, comparison or walkthrough. */
  sectionVehicle?: string;
  role: "cover" | "contents" | "section-opener" | "content" | "closing";
  /**
   * The arrangements slides already finished came out as.
   *
   * Consecutive slides in the same shape are what makes a deck look
   * generated, and a model composing one slide has no other way to know what
   * the slide before it looked like.
   */
  avoidLayouts?: string[];
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

TEACH THE SUBJECT, AT ITS OWN DEPTH

- Depth over coverage. One idea explained properly is worth more than four
  mentioned. If the material for this slide is thin, go deeper into it rather
  than reaching for something else.
- Never describe the presentation or what the audience will do. Never write
  compliance boilerplate, HR-policy language or generic corporate safety
  guidance unless the lesson is specifically about those.
- When several related terms belong together, put them on one slide with the
  distinction between them made explicit — what each is for, and when someone
  reaches for one rather than another. Three definitions on three slides teach
  less than one slide that separates them.
- Before you return a block, read it back and ask: does this give a comparison
  a newcomer would follow, say what the thing is for, or show where they will
  meet it? If it only says what the thing is called and what category it
  belongs to, write it again.

EVIDENCE

- Naming well-known tools, standards, methods, patterns and terms is expected.
  That is the subject's vocabulary, not a claim about the world.
- Numbers inside a worked example are fine where they read as an illustration:
  "say it scores 99% on the data it trained on and 71% on data held back".
- Never state a figure, date, market claim, study finding or quotation as fact
  about the world unless it appears in supplied source material. With no
  source, no such figures at all.

WRITING IT

- Do not repeat anything listed as already covered.
- Vary the type across a deck. Consecutive slides of the same type read as filler.
- Write every string in the requested language.
- Every block needs a heading and either a body sentence or supporting items.
  If a block has nothing substantial to say, write fewer blocks. Never pad one
  to reach a length.
- takeaway: one sentence for the band at the foot of the slide — what the
  audience should carry away from it. The point of the slide, not a summary of
  it, and never a restatement of the title. Leave it out rather than repeat.
- Write to the length the layout allows. The limits below are not style advice:
  the template's boxes are a fixed size, and text past them is shrunk and then
  cut. Aim comfortably under each limit rather than at it. A heading is a
  label, not a sentence — name the idea in the fewest precise words and put the
  explanation in the body.
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
    // Who it is for and what it argues. Without these the model has only a
    // section title and a few words of subtopic to fill a slide from, which is
    // how every deck came out reading like the same deck.
    brief.audience ? `WRITTEN FOR: ${brief.audience}` : "",
    brief.thesis ? `THE LESSON ARGUES: ${brief.thesis}` : "",
    brief.misconception ? `IT IS CORRECTING THE BELIEF THAT: ${brief.misconception}` : "",
    brief.keyTerms?.length
      ? `VOCABULARY THIS LESSON TEACHES — use these words, in these forms, wherever this slide touches them: ${brief.keyTerms.join(", ")}`
      : "",
    "",
    `SLIDE ${brief.position} of ${brief.totalSlides}.`,
    roleLine,
    "",
    `SECTION: ${brief.sectionTitle}`,
    `What this section must achieve: ${brief.sectionSummary}`,
    brief.sectionClaim ? `WHAT THIS SECTION ASSERTS: ${brief.sectionClaim}` : "",
    brief.sectionVehicle ? `HOW THIS SECTION MAKES ITS CASE: ${brief.sectionVehicle}` : "",
    "",
    brief.plannedTitle && brief.role !== "cover"
      ? `THIS SLIDE'S TITLE, as the instructor approved it: "${brief.plannedTitle}"\nKeep it, or improve the wording without changing what it promises.`
      : "",
    brief.slidesInSection && brief.slidesInSection > 1
      ? `This is slide ${brief.positionInSection} of ${brief.slidesInSection} in this section. Cover the points below and nothing else from the section — its other slides carry the rest.`
      : "",
    brief.subtopics.length
      ? `THIS SLIDE MUST COVER:\n${brief.subtopics.map((t) => `- ${t}`).join("\n")}` +
        `\n\nWrite one block per point above — ${brief.subtopics.length} block${
          brief.subtopics.length === 1 ? "" : "s"
        }, no more. If a point is too big for one block, teach the part that matters most and leave the rest; do not add blocks to fit everything in.`
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
      // The craft guide and its worked pairs go in front of the mechanics:
      // a model shown a shallow slide beside the deep version of the same
      // slide writes the deep one, where a model merely asked for depth
      // writes a longer definition.
      systemInstruction: `${SYSTEM}\n\n${SLIDE_CRAFT}\n\n${SLIDE_EXEMPLARS}\n\n${layoutBudget(brief)}`,
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
