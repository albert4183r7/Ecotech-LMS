import { generateStructuredFromImages } from "@/lib/ai";
import { renderSlide } from "@/lib/render/slide-renderer";
import { ensureCanvasDocument } from "@/lib/sanitize";
import { EvaluationSchema, type EvaluationResult, type Finding } from "./schema";

// ============================================
// Visual critic
//
// Judges the rendered slide, not its markup. Two sources of truth are
// combined: faults measured from the DOM, which are exact and free, and a
// model looking at the image, which catches what cannot be measured —
// hierarchy, balance, whether a layout reads as designed or as raw output.
// ============================================

const VISUAL_SYSTEM = `You are a presentation designer reviewing a rendered slide image. Judge what you can see.

Report BLOCKING problems for:
- Text running off the slide or clipped at an edge.
- Text too small to read from the back of a room.
- Text that does not contrast enough with what is behind it.
- Elements overlapping so that either becomes hard to read.
- A wall of text where a slide should carry a few points.
- A slide that is almost empty, with one line floating in dead space.

Report ADVISORY problems for:
- Weak hierarchy: the title does not clearly dominate, or everything is the same weight.
- Careless alignment, or inconsistent spacing between similar elements.
- Decoration that carries no meaning.
- A layout identical to the neighbouring slides when the content differs.

Judge only what is visible in the image. Do not speculate about markup.
Score out of 100, where 100 is a slide you would put in a client deck.`;

export interface VisualEvaluationInput {
  slideId: string;
  position: number;
  title: string;
  html: string;
  /** Titles of the slides either side, to judge layout repetition. */
  neighbours?: { previous?: string; next?: string };
}

export interface VisualEvaluation extends EvaluationResult {
  slideId: string;
  /** Faults measured from the DOM rather than judged from the image. */
  measuredFaults: string[];
  fillPercent: number;
}

/**
 * Render a slide and evaluate how it looks.
 *
 * Measured faults are merged in as blocking findings. They are certainties —
 * an element past the edge is past the edge — so they do not depend on the
 * model noticing them.
 */
export async function evaluateSlideVisual(input: VisualEvaluationInput): Promise<VisualEvaluation> {
  const document = ensureCanvasDocument(input.html, input.title);
  const { png, faults, fillRatio } = await renderSlide(document, { deviceScaleFactor: 2 });

  const measuredFindings: Finding[] = faults.map((f) => ({
    severity: "blocking" as const,
    slidePosition: input.position,
    problem: `Measured on the rendered slide — ${f.detail}`,
    fix:
      f.kind === "overflow-y" || f.kind === "overflow-x" || f.kind === "out-of-bounds"
        ? "Cut content or reduce type and spacing so everything fits inside the slide"
        : f.kind === "tiny-text"
          ? "Raise the smallest type size so it stays readable when projected"
          : "Give the slide real content",
  }));

  const prompt = [
    `Slide ${input.position}: "${input.title}"`,
    input.neighbours?.previous ? `Previous slide: "${input.neighbours.previous}"` : "",
    input.neighbours?.next ? `Next slide: "${input.neighbours.next}"` : "",
    "",
    `Roughly ${Math.round(fillRatio * 100)}% of the slide area carries text.`,
    "Review the attached image.",
  ]
    .filter(Boolean)
    .join("\n");

  let judged: EvaluationResult;
  try {
    judged = await generateStructuredFromImages(
      prompt,
      [{ mimeType: "image/png", data: png.toString("base64") }],
      EvaluationSchema,
      { task: "visual-evaluation", systemInstruction: VISUAL_SYSTEM, temperature: 0.15 },
    );
  } catch (err) {
    // A failed critic must not discard the measurements, which are the more
    // reliable half of this evaluation.
    console.error(`[visual] model evaluation failed for slide ${input.slideId}:`, err);
    judged = {
      score: measuredFindings.length > 0 ? 40 : 70,
      summary: "Visual model evaluation unavailable; measured layout only.",
      findings: [],
    };
  }

  // Measured faults override an over-generous score.
  const score = measuredFindings.length > 0 ? Math.min(judged.score, 45) : judged.score;

  return {
    slideId: input.slideId,
    score,
    summary: judged.summary,
    findings: [
      ...measuredFindings,
      ...judged.findings.map((f) => ({ ...f, slidePosition: input.position })),
    ],
    measuredFaults: faults.map((f) => `${f.kind}: ${f.detail}`),
    fillPercent: Math.round(fillRatio * 100),
  };
}
