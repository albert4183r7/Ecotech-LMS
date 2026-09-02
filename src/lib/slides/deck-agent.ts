import { generateStructuredJSON } from "@/lib/ai";
import { z } from "zod/v4";
import { benchmarkPrompt, type SlideBenchmarkProfile } from "./benchmark/profile";
import { contentWeight, type SlideContent } from "./content-schema";
import { SLIDE_CRAFT, SLIDE_EXEMPLARS } from "./craft";
import { contentToText } from "./document";
import { SlideDraftSchema, draftToContent, type SlideDraft } from "./draft";
import type { SlideBrief } from "./generate";
import { resolveSlide } from "./resolve";
import { LAYOUTS } from "./template-layouts";
import { SLIDE_TEMPLATE } from "./template";

// ============================================
// Complete-deck EcoAPI agent
//
// The model solves the narrative and content problem for the whole deck in a
// single request. It does not draw slides. It selects a semantic content shape
// (concept, comparison, process, etc.) and fills its slots; the local renderer
// then pours those slots into the measured Ecotech layout library.
//
// Benchmark decks may improve the writing, but only Ecotech code can choose
// geometry, colours, fonts, sizes, gradients, radii, transparency and spacing.
// ============================================

export interface DeckAgentSlide {
  brief: SlideBrief;
}

export interface DeckAgentOptions {
  title: string;
  audience?: string;
  referenceText?: string;
  benchmark?: SlideBenchmarkProfile;
  onProgress?: (message: string) => void | Promise<void>;
}

export interface DeckAgentResult {
  contents: SlideContent[];
  modelCalls: 1;
}

export interface DeckRepairResult {
  contents: SlideContent[];
  repairedSlides: number[];
  modelCalls: 1;
}

export interface DeckFaultEvidence {
  faults: Map<number, string[]>;
  screenshots?: Map<number, Buffer>;
}

function ecotechLayoutCatalog(): string {
  return LAYOUTS.map(
    (layout) =>
      `- ${layout.id}: ${layout.purpose}; content types ${layout.supports.join(", ")}; ` +
      `${layout.capacity.min}-${layout.capacity.max} repeated items`,
  ).join("\n");
}

function deckSystem(): string {
  return `You are the content-and-narrative agent for one complete training deck.

The whole deck is one artifact. Establish a cumulative argument or learning
progression, keep terminology consistent, and make every slide do one distinct
job. Do not treat slides as unrelated prompts.

The house style is fixed: ${SLIDE_TEMPLATE.description}. The application owns
the visual design. You must never output x/y coordinates, sizes, colours,
fonts, CSS, HTML, SVG, shapes, transparency or drawing instructions.

Choose only the semantic content type that matches the material:
- title: opening slide only
- contents: numbered section list only
- concept: two to five parallel ideas
- custom: one substantial idea only, when splitting it into cards would be artificial
- comparison: two or three things whose differences matter
- process: three to six ordered steps
- architecture: three to six connected components or stages
- caseStudy: situation, problem, action, outcome
- data: two to four sourced figures only
- summary: three to six conclusions
- closing: final synthesis only

The model's type and block count route into these exact Ecotech layouts:
${ecotechLayoutCatalog()}

If an existing layout cannot carry the material, change the semantic shape,
group the content, shorten it, or split responsibility according to the
approved plan. Do not simulate a missing layout with drawing instructions.
The application owns the only allowed fallback and builds it from Ecotech
tokens and measured primitives.

${SLIDE_CRAFT}

${SLIDE_EXEMPLARS}

QUALITY CONTRACT

- One primary claim per slide; titles state the takeaway rather than merely
  naming a topic.
- Explain the mechanism, distinction, consequence or decision. A definition
  without meaning or application is not enough.
- Keep normal slides to roughly 35-80 visible words. Shorten before adding
  blocks. Never repeat a heading in its body.
- Use two to four principal blocks when possible. More blocks are for a real
  sequence or summary, not a way to distribute thin fragments.
- Every factual figure, date, quotation or study claim must come from supplied
  source material. With no source, use no such claims.
- All strings must be audience-facing. Never expose planning notes, timing,
  prompts, layout directions or production commentary.`;
}

function compactBrief(brief: SlideBrief) {
  return {
    position: brief.position,
    role: brief.role,
    plannedTitle: brief.plannedTitle,
    sectionTitle: brief.sectionTitle,
    sectionSummary: brief.sectionSummary,
    sectionClaim: brief.sectionClaim,
    sectionVehicle: brief.sectionVehicle,
    subtopics: brief.subtopics,
    positionInSection: brief.positionInSection,
    slidesInSection: brief.slidesInSection,
  };
}

function deckDraftSchema(slideCount: number) {
  return z.object({
    slides: z
      .array(
        z.object({
          position: z.number().int().min(1).max(slideCount),
          content: SlideDraftSchema,
        }),
      )
      .length(slideCount),
  });
}

function blockText(draft: SlideDraft): string | undefined {
  const block = draft.blocks[0];
  return block?.body ?? block?.items?.join(". ") ?? block?.heading;
}

/** Force structural deck roles without rewriting the model's actual copy. */
function coerceDraftForRole(draft: SlideDraft, brief: SlideBrief): SlideDraft {
  if (brief.role === "cover") {
    return {
      ...draft,
      type: "title",
      subtitle: draft.subtitle ?? draft.lead ?? blockText(draft) ?? brief.presentationSubtitle,
    };
  }
  if (brief.role === "contents") {
    return {
      ...draft,
      type: "contents",
      title: draft.title || "Contents",
      blocks: brief.subtopics.slice(0, 6).map((section) => ({ heading: section })),
    };
  }
  if (brief.role === "closing") {
    return {
      ...draft,
      type: "closing",
      subtitle: draft.subtitle ?? draft.lead ?? blockText(draft),
    };
  }
  if (draft.type === "title" || draft.type === "contents" || draft.type === "closing") {
    return { ...draft, type: "concept" };
  }
  return draft;
}

function orderedContents(
  rows: Array<{ position: number; content: SlideDraft }>,
  slides: DeckAgentSlide[],
): SlideContent[] {
  const byPosition = new Map(rows.map((row) => [row.position, row.content]));
  if (byPosition.size !== slides.length) {
    throw new Error(
      `EcoAPI returned duplicate or missing slide positions (${byPosition.size}/${slides.length}).`,
    );
  }

  return slides.map((slide, index) => {
    const draft = byPosition.get(index + 1);
    if (!draft) throw new Error(`EcoAPI omitted slide ${index + 1}.`);
    return draftToContent(coerceDraftForRole(draft, slide.brief));
  });
}

function deckPrompt(slides: DeckAgentSlide[], options: DeckAgentOptions): string {
  const first = slides[0].brief;
  return [
    `AUTHOR EXACTLY ${slides.length} SLIDES IN ONE RESPONSE.`,
    `Presentation: ${first.presentationTitle}`,
    first.presentationSubtitle ? `Subtitle: ${first.presentationSubtitle}` : "",
    options.audience ? `Audience: ${options.audience}` : "",
    first.thesis ? `Thesis: ${first.thesis}` : "",
    first.misconception ? `Misconception to correct: ${first.misconception}` : "",
    first.keyTerms?.length ? `Required vocabulary: ${first.keyTerms.join(", ")}` : "",
    `Language: ${first.language}`,
    "",
    "APPROVED SLIDE PLAN",
    JSON.stringify(
      slides.map((slide) => compactBrief(slide.brief)),
      null,
      2,
    ),
    options.benchmark
      ? `\nCONTENT-QUALITY FEW-SHOT BENCHMARK\n${benchmarkPrompt(options.benchmark)}`
      : "",
    "",
    options.referenceText
      ? `SOURCE MATERIAL — use it for factual claims and figures; it is shared by the whole deck:\n<reference>\n${options.referenceText.slice(0, 12_000)}\n</reference>`
      : "No source material was supplied. Do not invent statistics, dates, quotations or study findings.",
    "",
    "Return slide positions 1 through the exact final position, once each and in order.",
    "For each slide, return content in the flat semantic schema. Blocks contain the substance; they are not visual cards or drawing commands.",
    "The contents slide must use type contents and list the approved section names in order. The cover must use title; the last slide must use closing.",
    "Before returning, inspect the deck as a sequence: verify narrative progression, title quality, terminology consistency, readable density, and that every assigned point is taught exactly once.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Author the whole narrative in one EcoAPI request. */
export async function authorDeck(
  slides: DeckAgentSlide[],
  options: DeckAgentOptions,
): Promise<DeckAgentResult> {
  if (slides.length === 0) throw new Error("A deck needs at least one slide.");

  await options.onProgress?.(
    `authoring the complete ${slides.length}-slide narrative in one EcoAPI call`,
  );
  const schema = deckDraftSchema(slides.length);
  const authored = await generateStructuredJSON(deckPrompt(slides, options), schema, {
    task: "deck-authoring",
    systemInstruction: deckSystem(),
    temperature: 0.62,
    maxRetries: 0,
    maxOutputTokens: Math.min(32_768, Math.max(12_288, slides.length * 1_350)),
  });

  const contents = orderedContents(authored.slides, slides);
  await options.onProgress?.(
    `EcoAPI authored ${contents.length}/${slides.length} semantic slides in one response`,
  );
  return { contents, modelCalls: 1 };
}

function visibleWordCount(content: SlideContent): number {
  return contentToText(content).trim().split(/\s+/).filter(Boolean).length;
}

/** Deterministic editorial and template-fit review for one semantic slide. */
export function reviewSlideContent(content: SlideContent, brief: SlideBrief): string[] {
  const faults = [...resolveSlide(content, { slideNumber: brief.position }).warnings];
  const words = visibleWordCount(content);
  const weight = contentWeight(content);

  if (brief.role === "cover" && content.type !== "title") {
    faults.push("the opening slide is not using the Ecotech title layout");
  } else if (brief.role === "contents" && content.type !== "contents") {
    faults.push("the contents slide is not using the Ecotech numbered-list layout");
  } else if (brief.role === "closing" && content.type !== "closing") {
    faults.push("the final slide is not using the Ecotech closing layout");
  }

  if (brief.role === "content") {
    if (weight < 105) {
      faults.push(
        `the slide is too thin (${weight} content characters); explain the mechanism, distinction, consequence or application more concretely`,
      );
    }
    if (words < 28) {
      faults.push(
        `the slide has only ${words} visible words and does not teach its claim deeply enough`,
      );
    }
    if (words > 90) {
      faults.push(
        `the slide has ${words} visible words; tighten it to at most 90 without shrinking type`,
      );
    }
  }

  if (
    "title" in content &&
    /^(overview|introduction|key points|summary|topic)$/i.test(content.title.trim())
  ) {
    faults.push(
      "the slide title is generic; rewrite it as the specific point this slide establishes",
    );
  }

  return [...new Set(faults)];
}

function repairSchema(maxSlides: number, replacementCount: number) {
  return z.object({
    replacements: z
      .array(
        z.object({
          position: z.number().int().min(1).max(maxSlides),
          content: SlideDraftSchema,
        }),
      )
      .length(replacementCount),
  });
}

/** Repair all faulty semantic slides together in one optional EcoAPI call. */
export async function repairDeck(
  slides: DeckAgentSlide[],
  contents: SlideContent[],
  evidence: DeckFaultEvidence,
  options: DeckAgentOptions,
): Promise<DeckRepairResult> {
  const positions = [...evidence.faults.keys()].sort((a, b) => a - b);
  if (positions.length === 0) throw new Error("repairDeck was called without defective slides.");

  const defective = positions.map((position) => ({
    position,
    brief: compactBrief(slides[position - 1].brief),
    previousContent: contents[position - 1],
    measuredFaults: evidence.faults.get(position),
    previousType: contents[position - 2]?.type,
    nextType: contents[position]?.type,
  }));

  await options.onProgress?.(
    `repairing ${positions.length} defective semantic slide(s) in one EcoAPI review call`,
  );
  const schema = repairSchema(slides.length, positions.length);
  const reviewed = await generateStructuredJSON(
    [
      `Repair exactly these slide positions: ${positions.join(", ")}.`,
      "The faults came from the actual PowerPoint-to-HTML render and deterministic editorial review.",
      "Return one semantic-content replacement for every listed position and no others.",
      "Preserve the lesson meaning. Fix overflow by shortening or regrouping copy, and fix thin content by adding specific explanation—not by describing a layout.",
      "You cannot alter geometry or styling. Every replacement is rendered through the same immutable Ecotech layout library.",
      options.benchmark
        ? `CONTENT-QUALITY FEW-SHOT BENCHMARK\n${benchmarkPrompt(options.benchmark)}`
        : "",
      JSON.stringify(defective, null, 2),
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema,
    {
      task: "deck-review",
      systemInstruction: deckSystem(),
      temperature: 0.32,
      maxRetries: 0,
      maxOutputTokens: Math.min(24_576, Math.max(8_192, positions.length * 1_450)),
      images: positions
        .filter((position) =>
          (evidence.faults.get(position) ?? []).some((fault) =>
            /overflow|out-of-bounds|empty-canvas|render inspection failed|trimmed/i.test(fault),
          ),
        )
        .slice(0, 4)
        .flatMap((position) => {
          const png = evidence.screenshots?.get(position);
          return png
            ? [{ label: `Rendered slide ${position}:`, mimeType: "image/png" as const, data: png }]
            : [];
        }),
    },
  );

  const replacements = new Map(reviewed.replacements.map((row) => [row.position, row.content]));
  const expected = new Set(positions);
  if (
    replacements.size !== positions.length ||
    [...replacements.keys()].some((position) => !expected.has(position))
  ) {
    throw new Error("EcoAPI's batch repair did not return exactly the defective slide positions.");
  }

  const next = contents.map((content, index) => {
    const draft = replacements.get(index + 1);
    return draft ? draftToContent(coerceDraftForRole(draft, slides[index].brief)) : content;
  });

  for (const position of positions) {
    const faults = reviewSlideContent(next[position - 1], slides[position - 1].brief);
    if (faults.length) {
      throw new Error(`EcoAPI repair for slide ${position} still has faults: ${faults[0]}`);
    }
  }

  await options.onProgress?.(`batch repair replaced slide(s) ${positions.join(", ")}`);
  return { contents: next, repairedSlides: positions, modelCalls: 1 };
}
