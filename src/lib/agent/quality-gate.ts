import { db } from "@/lib/db";
import { extractSlideText } from "@/lib/lesson-outline";
import { createRegistry, runTool, type ToolContext } from "./registry";
import { reviseSlideHtml, saveSlide } from "./tools/slides";
import { evaluateContent, evaluatePedagogy, type LessonSnapshot } from "./evaluators/content";
import { passes, type EvaluationResult, type Finding } from "./evaluators/schema";
import { recordEvaluation } from "./persistence";

// ============================================
// Quality gate
//
// Evaluate, revise only what failed, evaluate again. The cap matters as much
// as the loop: without one a lesson the model cannot fix would be rewritten
// forever.
// ============================================

export interface GatePassReport {
  pass: number;
  content: { score: number; blocking: number };
  pedagogy: { score: number; blocking: number };
  revisedSlides: string[];
  revisionErrors: string[];
}

export interface GateReport {
  passed: boolean;
  passes: GatePassReport[];
  /** Findings still outstanding when the gate gave up. */
  remaining: Finding[];
}

export interface GateOptions {
  runId: string;
  lessonId: string;
  audience?: string;
  referenceText?: string;
  /** Evaluate-and-revise cycles. Two is usually enough; more rarely converges. */
  maxPasses?: number;
  onProgress?: (message: string) => void | Promise<void>;
}

async function snapshot(lessonId: string, opts: GateOptions): Promise<LessonSnapshot> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { slides: { orderBy: { order: "asc" } } },
  });
  if (!lesson) throw new Error(`Lesson ${lessonId} not found`);

  return {
    title: lesson.title,
    audience: opts.audience,
    referenceText: opts.referenceText,
    slides: lesson.slides
      .filter((s) => s.htmlBody)
      .map((s) => ({
        position: s.order + 1,
        title: s.title,
        text: extractSlideText(s.htmlBody).slice(0, 1500),
      })),
  };
}

/** Group blocking findings by the slide they concern. Position 0 is lesson-wide. */
export function groupBlocking(results: EvaluationResult[]): Map<number, Finding[]> {
  const grouped = new Map<number, Finding[]>();
  for (const result of results) {
    for (const finding of result.findings) {
      if (finding.severity !== "blocking") continue;
      const list = grouped.get(finding.slidePosition) ?? [];
      list.push(finding);
      grouped.set(finding.slidePosition, list);
    }
  }
  return grouped;
}

export async function runQualityGate(options: GateOptions): Promise<GateReport> {
  const maxPasses = options.maxPasses ?? 2;
  const registry = createRegistry([reviseSlideHtml, saveSlide]);
  const ctx: ToolContext = {
    runId: options.runId,
    lessonId: options.lessonId,
    language: "english",
    scratch: {},
  };

  const passReports: GatePassReport[] = [];
  let remaining: Finding[] = [];

  for (let pass = 1; pass <= maxPasses; pass++) {
    const lesson = await snapshot(options.lessonId, options);
    if (lesson.slides.length === 0) {
      return { passed: false, passes: passReports, remaining: [] };
    }

    await options.onProgress?.(`Evaluating lesson (pass ${pass})`);

    // Both critics look at the same snapshot, so run them together.
    const [content, pedagogy] = await Promise.all([
      evaluateContent(lesson),
      evaluatePedagogy(lesson),
    ]);

    await Promise.all([
      recordEvaluation({
        runId: options.runId,
        scope: "content",
        score: content.score,
        passed: passes(content),
        findings: content.findings.map((f) => ({
          severity: f.severity,
          problem: f.problem,
          fix: f.fix,
        })),
      }),
      recordEvaluation({
        runId: options.runId,
        scope: "pedagogy",
        score: pedagogy.score,
        passed: passes(pedagogy),
        findings: pedagogy.findings.map((f) => ({
          severity: f.severity,
          problem: f.problem,
          fix: f.fix,
        })),
      }),
    ]);

    const blocking = groupBlocking([content, pedagogy]);
    const report: GatePassReport = {
      pass,
      content: { score: content.score, blocking: blocking.size },
      pedagogy: { score: pedagogy.score, blocking: 0 },
      revisedSlides: [],
      revisionErrors: [],
    };

    const clean = passes(content) && passes(pedagogy);
    if (clean) {
      passReports.push(report);
      return { passed: true, passes: passReports, remaining: [] };
    }

    remaining = [...content.findings, ...pedagogy.findings].filter(
      (f) => f.severity === "blocking",
    );

    // Last pass: report what is left rather than revising with no chance to check.
    if (pass === maxPasses) {
      passReports.push(report);
      break;
    }

    const slides = await db.slide.findMany({
      where: { lessonId: options.lessonId },
      orderBy: { order: "asc" },
      select: { id: true, order: true },
    });

    for (const [position, findings] of blocking) {
      // A lesson-wide finding has no single slide to rewrite.
      if (position === 0) continue;
      const slide = slides.find((s) => s.order + 1 === position);
      if (!slide) continue;

      const instructions = findings.map((f) => `${f.problem} Fix: ${f.fix}`);
      await options.onProgress?.(`Revising slide ${position}`);

      const revised = await runTool(
        registry,
        "revise_slide_html",
        { slideId: slide.id, findings: instructions },
        ctx,
      );
      if (!revised.ok) {
        report.revisionErrors.push(`slide ${position}: ${revised.error}`);
        continue;
      }

      const html = (revised.value as { html: string }).html;
      const saved = await runTool(registry, "save_slide", { slideId: slide.id, html }, ctx);
      if (!saved.ok) {
        report.revisionErrors.push(`slide ${position}: ${saved.error}`);
        continue;
      }
      report.revisedSlides.push(slide.id);
    }

    passReports.push(report);

    // Nothing could be revised, so another evaluation would return the same.
    if (report.revisedSlides.length === 0) break;
  }

  return { passed: false, passes: passReports, remaining };
}
