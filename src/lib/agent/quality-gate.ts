import { db } from "@/lib/db";
import { evaluateContent, evaluatePedagogy, type LessonSnapshot } from "./evaluators/content";
import { passes, blockingFindings, type EvaluationResult, type Finding } from "./evaluators/schema";
import { generateSlideContent, type SlideBrief } from "@/lib/slides/generate";
import { generateSlideComposition } from "@/lib/slides/composition-generate";
import {
  parseSlideDoc,
  renderSlideDoc,
  slideDocText,
  slideDocTitle,
  type SlideDoc,
} from "@/lib/slides/document";
import { sanitizeHtml, wrapSlideHtml } from "@/lib/sanitize";

// ============================================
// Quality gate
//
// Evaluate the finished lesson, revise only the slides a reviewer faulted,
// evaluate again. The bound matters as much as the loop: without one, a lesson
// the model cannot fix would be rewritten forever.
//
// This is the "how" inside a deterministic stage. The workflow decides that
// slides are followed by review and review by the quiz; the critics decide
// what is wrong, and the generator decides how to say it better. Nothing here
// chooses what happens next.
//
// It once operated on raw slide HTML through an agent tool registry, which has
// since been removed. Slides are structured now, so a revision regenerates the
// content and re-renders it through the template rather than asking a model to
// rewrite markup. This file and its two critics are all that remains of that
// subsystem, because they are the only part of it anything called.
// ============================================

export interface GateOptions {
  lessonId: string;
  audience?: string;
  referenceText?: string;
  /** Evaluate-and-revise cycles. Two is usually enough; more rarely converges. */
  maxPasses?: number;
  onProgress?: (message: string) => void | Promise<void>;
}

export interface GatePassReport {
  pass: number;
  content: { score: number; blocking: number };
  pedagogy: { score: number; blocking: number };
  revisedSlides: number[];
  revisionErrors: string[];
}

export interface GateReport {
  passed: boolean;
  passes: GatePassReport[];
  /** Findings still outstanding when the gate stopped. */
  remaining: Finding[];
}

interface SlideRow {
  id: string;
  title: string;
  order: number;
  contentJson: string | null;
  sectionId: string | null;
}

async function snapshot(
  lessonId: string,
  options: GateOptions,
): Promise<{ snapshot: LessonSnapshot; rows: SlideRow[]; title: string } | null> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      title: true,
      slides: {
        where: { status: "READY" },
        orderBy: { order: "asc" },
        select: { id: true, title: true, order: true, contentJson: true, sectionId: true },
      },
    },
  });
  if (!lesson || lesson.slides.length === 0) return null;

  const slides = lesson.slides
    .map((row) => {
      const doc = parseSlideDoc(row.contentJson);
      return doc ? { position: row.order + 1, title: row.title, text: slideDocText(doc) } : null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return {
    snapshot: {
      title: lesson.title,
      audience: options.audience,
      slides,
      referenceText: options.referenceText,
    },
    rows: lesson.slides,
    title: lesson.title,
  };
}

/** Blocking findings grouped by the slide position they name. */
export function groupBlocking(results: EvaluationResult[]): Map<number, Finding[]> {
  const grouped = new Map<number, Finding[]>();
  for (const result of results) {
    for (const finding of blockingFindings(result)) {
      // Position 0 means the lesson as a whole; those cannot be fixed by
      // regenerating one slide, so they are reported rather than acted on.
      if (finding.slidePosition <= 0) continue;
      const existing = grouped.get(finding.slidePosition) ?? [];
      existing.push(finding);
      grouped.set(finding.slidePosition, existing);
    }
  }
  return grouped;
}

/** Rebuild one slide from its brief, telling the generator what was wrong. */
async function reviseSlide(params: {
  lessonId: string;
  row: SlideRow;
  findings: Finding[];
  deckSize: number;
  language: string;
  referenceText?: string;
  lessonTitle: string;
  /** Which of the two slide models this row holds. */
  kind: SlideDoc["kind"];
}): Promise<void> {
  const section = params.row.sectionId
    ? await db.section.findUnique({
        where: { id: params.row.sectionId },
        select: { title: true, summary: true, subtopics: true },
      })
    : null;

  const brief: SlideBrief = {
    position: params.row.order + 1,
    totalSlides: params.deckSize,
    presentationTitle: params.lessonTitle,
    presentationSubtitle: "",
    sectionTitle: section?.title ?? params.lessonTitle,
    sectionSummary: section?.summary ?? "",
    subtopics: section ? (JSON.parse(section.subtopics) as string[]) : [],
    role:
      params.row.order === 0
        ? "cover"
        : params.row.order === params.deckSize - 1
          ? "closing"
          : "content",
    language: params.language,
    referenceText: params.referenceText,
    revisionNotes: params.findings.map((f) => `${f.problem} — ${f.fix}`),
  };

  // Revised the way it was authored. A composed slide is composed again — the
  // reviewer's findings go in beside the canvas rules — and a slide from a
  // lesson generated before compositions keeps its typed content, so a
  // revision never changes what the slide is, only what it says.
  const doc: SlideDoc =
    params.kind === "composition"
      ? { kind: "composition", composition: await generateSlideComposition(brief) }
      : { kind: "content", content: await generateSlideContent(brief) };

  const html = sanitizeHtml(renderSlideDoc(doc, { slideNumber: brief.position }));
  const title = slideDocTitle(doc, params.row.title);

  await db.slide.update({
    where: { id: params.row.id },
    data: {
      contentJson: JSON.stringify(doc.kind === "composition" ? doc.composition : doc.content),
      htmlBody: wrapSlideHtml(html, { title }),
      title,
    },
  });
}

/**
 * Run the gate over a generated lesson.
 *
 * Never throws: a lesson that cannot be evaluated is reported as unreviewed
 * rather than failing generation that otherwise succeeded.
 */
export async function runQualityGate(options: GateOptions): Promise<GateReport> {
  const maxPasses = options.maxPasses ?? 2;
  const reports: GatePassReport[] = [];
  let remaining: Finding[] = [];

  const lesson = await db.lesson.findUnique({
    where: { id: options.lessonId },
    select: { outlineJson: true },
  });
  const language =
    (() => {
      try {
        return (JSON.parse(lesson?.outlineJson ?? "{}") as { language?: string }).language;
      } catch {
        return undefined;
      }
    })() ?? "english";

  for (let pass = 1; pass <= maxPasses; pass++) {
    const taken = await snapshot(options.lessonId, options);
    if (!taken) {
      return { passed: false, passes: reports, remaining };
    }

    let content: EvaluationResult;
    let pedagogy: EvaluationResult;
    try {
      [content, pedagogy] = await Promise.all([
        evaluateContent(taken.snapshot),
        evaluatePedagogy(taken.snapshot),
      ]);
    } catch (error) {
      // The critics being unavailable must not fail a lesson whose slides
      // generated correctly.
      console.warn(
        `[quality-gate] lesson ${options.lessonId}: evaluation unavailable —`,
        error instanceof Error ? error.message : error,
      );
      return { passed: false, passes: reports, remaining };
    }

    const blocking = groupBlocking([content, pedagogy]);
    remaining = [...blocking.values()].flat();

    const report: GatePassReport = {
      pass,
      content: { score: content.score, blocking: blockingFindings(content).length },
      pedagogy: { score: pedagogy.score, blocking: blockingFindings(pedagogy).length },
      revisedSlides: [],
      revisionErrors: [],
    };

    await options.onProgress?.(
      `review pass ${pass}: content ${content.score}, pedagogy ${pedagogy.score}, ` +
        `${blocking.size} slide(s) to revise`,
    );

    if (passes(content) && passes(pedagogy)) {
      reports.push(report);
      return { passed: true, passes: reports, remaining: [] };
    }

    // Nothing actionable at slide level — further passes would re-evaluate an
    // unchanged lesson and reach the same verdict.
    if (blocking.size === 0) {
      reports.push(report);
      return { passed: false, passes: reports, remaining };
    }

    // Last pass: report rather than revise, since there is no pass left to
    // check the revision.
    if (pass === maxPasses) {
      reports.push(report);
      break;
    }

    const byPosition = new Map(taken.rows.map((row) => [row.order + 1, row]));
    for (const [position, findings] of blocking) {
      const row = byPosition.get(position);
      if (!row) continue;
      try {
        await reviseSlide({
          lessonId: options.lessonId,
          row,
          findings,
          deckSize: taken.rows.length,
          language,
          referenceText: options.referenceText,
          lessonTitle: taken.title,
          kind: parseSlideDoc(row.contentJson)?.kind ?? "composition",
        });
        report.revisedSlides.push(position);
      } catch (error) {
        report.revisionErrors.push(
          `slide ${position}: ${error instanceof Error ? error.message : "revision failed"}`,
        );
      }
    }

    reports.push(report);
  }

  return { passed: false, passes: reports, remaining };
}
