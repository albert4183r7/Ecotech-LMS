import { db } from "@/lib/db";
import { evaluateContent, evaluatePedagogy, type LessonSnapshot } from "./evaluators/content";
import { passes, blockingFindings, type EvaluationResult, type Finding } from "./evaluators/schema";
import { recordEvaluation } from "./persistence";
import { SlideContentSchema, type SlideContent } from "@/lib/slides/content-schema";
import { generateSlideContent, type SlideBrief } from "@/lib/slides/generate";
import { renderSlideContent } from "@/lib/slides/render";
import { readLessonTemplateId } from "@/lib/slides/lesson-template";
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
// It previously operated on raw slide HTML through the agent's tool registry.
// Slides are structured content now, so a revision regenerates the content and
// re-renders it through the template rather than asking a model to rewrite
// markup.
// ============================================

export interface GateOptions {
  lessonId: string;
  /** Persists evaluations against an agent run, when one is recording. */
  runId?: string;
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

/** Flatten one slide's structured content into the text a critic reads. */
function contentToText(content: SlideContent): string {
  switch (content.type) {
    case "title":
    case "closing":
      return [content.title, "subtitle" in content ? content.subtitle : ""]
        .filter(Boolean)
        .join(". ");
    case "concept":
      return [content.lead, ...content.points.map((p) => `${p.heading}: ${p.description}`)]
        .filter(Boolean)
        .join(" ");
    case "comparison":
      return [content.lead, ...content.columns.map((c) => `${c.heading}: ${c.points.join("; ")}`)]
        .filter(Boolean)
        .join(" ");
    case "process":
      return [content.lead, ...content.steps.map((s) => `${s.label}: ${s.description}`)]
        .filter(Boolean)
        .join(" ");
    case "architecture":
      return [
        content.lead,
        ...content.nodes.map((n) => `${n.label}${n.description ? `: ${n.description}` : ""}`),
      ]
        .filter(Boolean)
        .join(" ");
    case "caseStudy":
      return `Situation: ${content.situation} Problem: ${content.problem} Action: ${content.action} Outcome: ${content.outcome}`;
    case "data":
      return [
        content.lead,
        ...content.stats.map((s) => `${s.value} ${s.label}${s.note ? ` (${s.note})` : ""}`),
      ]
        .filter(Boolean)
        .join(" ");
    case "summary":
      return content.takeaways.join(" ");
  }
}

interface SlideRow {
  id: string;
  title: string;
  order: number;
  contentJson: string | null;
  sectionId: string | null;
}

function parseContent(row: SlideRow): SlideContent | null {
  if (!row.contentJson) return null;
  const parsed = SlideContentSchema.safeParse(JSON.parse(row.contentJson));
  return parsed.success ? parsed.data : null;
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
      const content = parseContent(row);
      return content
        ? { position: row.order + 1, title: row.title, text: contentToText(content) }
        : null;
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
  templateId: string;
  referenceText?: string;
  lessonTitle: string;
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

  const content = await generateSlideContent(brief);
  const html = sanitizeHtml(
    renderSlideContent(content, { templateId: params.templateId, slideNumber: brief.position }),
  );
  const title = "title" in content && content.title ? content.title.slice(0, 90) : params.row.title;

  await db.slide.update({
    where: { id: params.row.id },
    data: {
      contentJson: JSON.stringify(content),
      htmlBody: wrapSlideHtml(html, { title, templateId: params.templateId }),
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
  const templateId = readLessonTemplateId(lesson?.outlineJson ?? null);
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

    if (options.runId) {
      await Promise.all([
        recordEvaluation({
          runId: options.runId,
          scope: "content",
          score: content.score,
          passed: passes(content),
          findings: content.findings,
        }),
        recordEvaluation({
          runId: options.runId,
          scope: "pedagogy",
          score: pedagogy.score,
          passed: passes(pedagogy),
          findings: pedagogy.findings,
        }),
      ]).catch(() => undefined);
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
          templateId,
          referenceText: options.referenceText,
          lessonTitle: taken.title,
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
