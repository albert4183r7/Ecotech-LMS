import { after, NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { requireLessonOwner, AuthorizationError } from "@/lib/session";
import { sanitizeHtml, wrapSlideHtml } from "@/lib/sanitize";
import { isRetryable } from "@/lib/slide-status";
import { CONTENTS_FROM } from "@/lib/presentation-plan";
import {
  authorDeck,
  repairDeck,
  reviewSlideContent,
  type DeckAgentSlide,
} from "@/lib/slides/deck-agent";
import { buildDeckArtifact } from "@/lib/slides/deck-artifact";
import { loadActiveBenchmarkProfile } from "@/lib/slides/benchmark/profile";
import { importPptx, type ImportedDeck } from "@/lib/slides/import/pptx";
import type { SlideBrief } from "@/lib/slides/generate";
import { SLIDE_TEMPLATE, type SlideTemplate } from "@/lib/slides/template";
import { renderSlide } from "@/lib/render/slide-renderer";
import { generateAndSaveQuiz } from "@/lib/quiz/persist";
import { generateAndSaveNarratedLesson } from "@/lib/video/generate";

// ============================================
// POST /api/lessons/generate-slides — phase two
//
// The approved outline is the deck spec. One deck agent authors and reviews
// every slide in narrative order, writes an actual PowerPoint artifact, and
// then imports that artifact into the HTML used by lesson view. Slides become
// READY together only after the complete PPTX round-trip succeeds.
// ============================================

const DECK_DIR = path.join(process.cwd(), "public", "uploads", "decks");

interface GenerateSlidesRequest {
  lessonId: string;
  language?: string;
}

interface StoredSection {
  title: string;
  summary: string;
  subtopics: string[];
  slideBudget: number;
  claim?: string;
  vehicle?: string;
}

interface StoredOutlinePlan {
  topic?: string;
  style?: string;
  language?: string;
  title?: string;
  subtitle?: string;
  sections?: StoredSection[];
  referenceContext?: string;
  audience?: string;
  thesis?: string;
  misconception?: string;
  keyTerms?: string[];
  quizQuestionCount?: number;
  artifact?: {
    kind: "generated-pptx";
    file: string;
    generatedAt: string;
    warnings: string[];
    review: {
      passed: boolean;
      skipped: boolean;
      passes: number;
      remainingFindings: number;
    };
    benchmark?: { sourceSha256: string; sourceFile: string };
  };
}

function safeMediaName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function writeAndImportArtifact(title: string, buffer: Buffer) {
  const deckId = randomUUID();
  const dir = path.join(DECK_DIR, deckId);
  await mkdir(dir, { recursive: true });

  const sourceName = "source.pptx";
  await writeFile(path.join(dir, sourceName), buffer);

  const imported = await importPptx(buffer, {
    async saveMedia(name, data) {
      const fileName = safeMediaName(name);
      await writeFile(path.join(dir, fileName), Buffer.from(data));
      return `/uploads/decks/${deckId}/${fileName}`;
    },
  });

  if (!imported.title) imported.title = title;
  return {
    imported,
    publicPath: `/uploads/decks/${deckId}/${sourceName}`,
  };
}

function mediaMime(name: string): string {
  const extension = path.extname(name).toLowerCase();
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  return "image/png";
}

/** Import a generated artifact without writing review-only media to disk. */
async function importForInspection(buffer: Buffer): Promise<ImportedDeck> {
  return importPptx(buffer, {
    async saveMedia(name, data) {
      return `data:${mediaMime(name)};base64,${Buffer.from(data).toString("base64")}`;
    },
  });
}

interface ArtifactInspection {
  faults: Map<number, string[]>;
  screenshots: Map<number, Buffer>;
  warnings: string[];
}

function addFault(faults: Map<number, string[]>, position: number, detail: string): void {
  const existing = faults.get(position) ?? [];
  if (!existing.includes(detail)) existing.push(detail);
  faults.set(position, existing);
}

/**
 * Inspect the actual PPTX round trip, three local Chromium renders at a time.
 * This parallelism is deterministic rendering only; it does not create
 * per-slide AI calls.
 */
async function inspectArtifact(
  buffer: Buffer,
  contents: Awaited<ReturnType<typeof authorDeck>>["contents"],
  slides: DeckAgentSlide[],
  artifactWarnings: string[],
  template: SlideTemplate,
): Promise<ArtifactInspection> {
  if (template.id !== SLIDE_TEMPLATE.id) {
    throw new Error("Generated decks must be inspected with the Ecotech template.");
  }
  const imported = await importForInspection(buffer);
  if (imported.slides.length !== contents.length) {
    throw new Error(
      `PowerPoint round-trip returned ${imported.slides.length} of ${contents.length} slides`,
    );
  }

  const faults = new Map<number, string[]>();
  const screenshots = new Map<number, Buffer>();
  const warnings: string[] = [...artifactWarnings];

  contents.forEach((content, index) => {
    const position = index + 1;
    reviewSlideContent(content, slides[index].brief).forEach((fault) =>
      addFault(faults, position, fault),
    );
  });

  for (const warning of artifactWarnings) {
    const match = warning.match(/^slide (\d+):\s*(.+)$/i);
    if (match) addFault(faults, Number(match[1]), match[2]);
  }

  imported.slides.forEach((slide, index) => {
    slide.warnings.forEach((warning) => {
      warnings.push(`slide ${index + 1}: ${warning}`);
      addFault(faults, index + 1, warning);
    });
  });

  const positions = imported.slides.map((_, index) => index);
  for (let offset = 0; offset < positions.length; offset += 3) {
    await Promise.all(
      positions.slice(offset, offset + 3).map(async (index) => {
        const slide = imported.slides[index];
        const title = slide.title || `Slide ${index + 1}`;
        try {
          const rendered = await renderSlide(wrapSlideHtml(sanitizeHtml(slide.html), { title }), {
            deviceScaleFactor: 1,
          });
          screenshots.set(index + 1, rendered.png);
          rendered.faults.forEach((fault) => {
            // The imported artifact includes the template's own 10pt page
            // number, but unlike native compositions it no longer carries the
            // __footer marker. At 13px it is intentional furniture; authored
            // text resolves to at least 14px and is still reported.
            if (fault.kind === "tiny-text" && /smallest text is 13px/i.test(fault.detail)) {
              return;
            }
            addFault(faults, index + 1, `${fault.kind}: ${fault.detail}`);
          });
        } catch (error) {
          addFault(
            faults,
            index + 1,
            `render inspection failed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }),
    );
  }

  for (const [position, details] of faults) {
    details.forEach((detail) => warnings.push(`slide ${position}: ${detail}`));
  }

  return { faults, screenshots, warnings };
}

async function generateDeck(lessonId: string, languageOverride?: string): Promise<void> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      course: { select: { language: true } },
      sections: { orderBy: { order: "asc" } },
      slides: { orderBy: { order: "asc" } },
    },
  });

  if (!lesson || lesson.slides.length === 0) {
    console.error(`[generate-slides] lesson ${lessonId} not found or has no slides`);
    return;
  }

  let plan: StoredOutlinePlan = {};
  try {
    plan = lesson.outlineJson ? (JSON.parse(lesson.outlineJson) as StoredOutlinePlan) : {};
  } catch {
    plan = {};
  }

  const deck = lesson.slides;
  const pending = deck.filter((slide) => isRetryable(slide.status, slide.updatedAt));
  if (pending.length === 0) {
    console.log(`[generate-slides] lesson ${lessonId}: nothing pending`);
    return;
  }

  const pendingIds = pending.map((slide) => slide.id);
  await db.slide.updateMany({
    where: { id: { in: pendingIds } },
    data: { status: "GENERATING" },
  });

  try {
    const language = languageOverride ?? plan.language ?? lesson.course?.language ?? "english";
    const plannedByTitle = new Map(
      (plan.sections ?? []).map((section) => [section.title, section]),
    );
    const sections: StoredSection[] = lesson.sections.length
      ? lesson.sections.map((section) => ({
          title: section.title,
          summary: section.summary,
          subtopics: JSON.parse(section.subtopics) as string[],
          slideBudget: section.slideBudget,
          claim: plannedByTitle.get(section.title)?.claim,
          vehicle: plannedByTitle.get(section.title)?.vehicle,
        }))
      : (plan.sections ?? []);
    const sectionById = new Map(lesson.sections.map((section) => [section.id, section]));

    const roleAt = (position: number): SlideBrief["role"] =>
      position === 0
        ? "cover"
        : position === 1 && deck.length >= CONTENTS_FROM
          ? "contents"
          : position === deck.length - 1
            ? "closing"
            : "content";

    const subtopicsForSlide = new Map<string, string[]>();
    for (const section of lesson.sections) {
      const owned = deck.filter(
        (slide) => slide.sectionId === section.id && roleAt(deck.indexOf(slide)) === "content",
      );
      const topics = JSON.parse(section.subtopics) as string[];
      const perSlide = Math.ceil(topics.length / Math.max(1, owned.length));
      owned.forEach((slide, index) => {
        subtopicsForSlide.set(slide.id, topics.slice(index * perSlide, (index + 1) * perSlide));
      });
    }

    const contentsList = lesson.sections.map((section) => section.title);
    const agentSlides: DeckAgentSlide[] = deck.map((slide, position) => {
      const section = slide.sectionId ? sectionById.get(slide.sectionId) : undefined;
      const sectionIndex = section ? section.order : 0;
      const owned = deck.filter((candidate) => candidate.sectionId === slide.sectionId);
      const positionInSection = Math.max(
        1,
        owned.findIndex((candidate) => candidate.id === slide.id) + 1,
      );
      const role = roleAt(position);
      const planned = section ? plannedByTitle.get(section.title) : sections[sectionIndex];
      return {
        brief: {
          position: position + 1,
          totalSlides: deck.length,
          presentationTitle: plan.title ?? lesson.title,
          presentationSubtitle: plan.subtitle ?? "",
          sectionTitle: section?.title ?? sections[sectionIndex]?.title ?? lesson.title,
          sectionSummary: section?.summary ?? sections[sectionIndex]?.summary ?? "",
          subtopics: role === "contents" ? contentsList : (subtopicsForSlide.get(slide.id) ?? []),
          role,
          language,
          audience: plan.audience,
          thesis: plan.thesis,
          misconception: plan.misconception,
          keyTerms: plan.keyTerms,
          plannedTitle: slide.title,
          positionInSection,
          slidesInSection: owned.length,
          sectionClaim: planned?.claim,
          sectionVehicle: planned?.vehicle,
          referenceText: plan.referenceContext,
        },
      };
    });

    console.log(
      `[generate-slides] lesson ${lessonId}: EcoAPI authoring one complete ${deck.length}-slide deck ` +
        `(${pending.length} retryable row(s))`,
    );

    const benchmark = await loadActiveBenchmarkProfile();
    if (benchmark) {
      console.log(
        `[generate-slides] lesson ${lessonId}: benchmark ${benchmark.sourceSha256.slice(0, 12)} ` +
          `(${benchmark.layouts.length} cached layouts from ${benchmark.sourceFile})`,
      );
    }

    const generationStarted = performance.now();
    const agentOptions = {
      title: plan.title ?? lesson.title,
      audience: plan.audience ?? plan.topic,
      referenceText: plan.referenceContext,
      benchmark: benchmark ?? undefined,
      onProgress: (message: string) => console.log(`[generate-slides] ${message}`),
    };
    const authored = await authorDeck(agentSlides, {
      ...agentOptions,
    });
    console.log(
      `[generate-slides] lesson ${lessonId}: complete-deck EcoAPI call finished in ` +
        `${((performance.now() - generationStarted) / 1000).toFixed(1)}s`,
    );

    let contents = authored.contents;
    let artifact = await buildDeckArtifact(
      plan.title ?? lesson.title,
      contents,
      SLIDE_TEMPLATE,
    );
    console.log(
      `[generate-slides] lesson ${lessonId}: PowerPoint artifact generated (${artifact.buffer.length} bytes)`,
    );

    let inspection = await inspectArtifact(
      artifact.buffer,
      contents,
      agentSlides,
      artifact.warnings,
      SLIDE_TEMPLATE,
    );
    const initialFaultCount = [...inspection.faults.values()].reduce(
      (count, faults) => count + faults.length,
      0,
    );
    let repairAttempted = false;
    let repairedSlides: number[] = [];

    if (inspection.faults.size > 0) {
      repairAttempted = true;
      const firstContents = contents;
      const firstArtifact = artifact;
      const firstInspection = inspection;
      console.warn(
        `[generate-slides] lesson ${lessonId}: rendered artifact has ${initialFaultCount} fault(s) ` +
          `on ${inspection.faults.size} slide(s); starting one batch repair`,
      );
      try {
        const repaired = await repairDeck(
          agentSlides,
          contents,
          { faults: inspection.faults, screenshots: inspection.screenshots },
          agentOptions,
        );
        contents = repaired.contents;
        repairedSlides = repaired.repairedSlides;
        artifact = await buildDeckArtifact(
          plan.title ?? lesson.title,
          contents,
          SLIDE_TEMPLATE,
        );
        inspection = await inspectArtifact(
          artifact.buffer,
          contents,
          agentSlides,
          artifact.warnings,
          SLIDE_TEMPLATE,
        );
      } catch (error) {
        // The first call already produced a complete deck. A failed optional
        // repair must not turn that artifact into missing lesson slides.
        console.warn(
          `[generate-slides] lesson ${lessonId}: batch repair unavailable; keeping the complete first artifact — ` +
            `${error instanceof Error ? error.message : "unknown error"}`,
        );
        contents = firstContents;
        artifact = firstArtifact;
        inspection = firstInspection;
        repairedSlides = [];
      }
    }

    const roundTrip = await writeAndImportArtifact(plan.title ?? lesson.title, artifact.buffer);
    if (roundTrip.imported.slides.length !== deck.length) {
      throw new Error(
        `PowerPoint round-trip returned ${roundTrip.imported.slides.length} of ${deck.length} slides`,
      );
    }

    const remainingFaults = [...inspection.faults.values()].reduce(
      (count, faults) => count + faults.length,
      0,
    );
    const warnings = [...new Set(inspection.warnings)];
    const nextPlan: StoredOutlinePlan = {
      ...plan,
      artifact: {
        kind: "generated-pptx",
        file: roundTrip.publicPath,
        generatedAt: new Date().toISOString(),
        warnings,
        review: {
          passed: remainingFaults === 0,
          skipped: !repairAttempted,
          passes: repairAttempted ? 1 : 0,
          remainingFindings: remainingFaults,
        },
        benchmark: benchmark
          ? { sourceSha256: benchmark.sourceSha256, sourceFile: benchmark.sourceFile }
          : undefined,
      },
    };

    await db.$transaction([
      ...deck.map((slide, index) => {
        const imported = roundTrip.imported.slides[index];
        const content = contents[index];
        const title = (
          imported.title ||
          ("title" in content ? content.title : "") ||
          slide.title ||
          `Slide ${index + 1}`
        ).slice(0, 90);
        return db.slide.update({
          where: { id: slide.id },
          data: {
            title,
            contentJson: JSON.stringify(content),
            htmlBody: wrapSlideHtml(sanitizeHtml(imported.html), { title }),
            status: "READY",
          },
        });
      }),
      db.lesson.update({
        where: { id: lessonId },
        data: { outlineJson: JSON.stringify(nextPlan) },
      }),
    ]);

    if (warnings.length) {
      console.warn(
        `[generate-slides] lesson ${lessonId}: artifact round-trip produced ` +
          `${warnings.length} warning(s)`,
        warnings.slice(0, 5),
      );
    }
    console.log(
      `[generate-slides] lesson ${lessonId}: ${deck.length}/${deck.length} slides ready from PPTX` +
        (repairedSlides.length ? `; batch-repaired ${repairedSlides.join(", ")}` : ""),
    );

    await Promise.all([
      db.quiz.upsert({
        where: { lessonId },
        create: { lessonId, title: "Quiz", status: "DRAFT", error: null },
        update: { status: "DRAFT", error: null },
      }),
      db.lessonVideo.upsert({
        where: { lessonId },
        create: { lessonId, status: "DRAFT", language, error: null },
        update: { status: "DRAFT", language, error: null },
      }),
    ]).catch((error) => {
      console.warn(`[generate-slides] lesson ${lessonId}: could not mark media pending —`, error);
    });

    const [quizResult, videoResult] = await Promise.allSettled([
      generateAndSaveQuiz(lessonId, { questionCount: plan.quizQuestionCount }),
      generateAndSaveNarratedLesson(lessonId, { language }),
    ]);

    if (quizResult.status === "rejected") {
      console.warn(`[generate-slides] lesson ${lessonId}: quiz task failed —`, quizResult.reason);
    } else if (quizResult.value.status === "ERROR") {
      console.warn(
        `[generate-slides] lesson ${lessonId}: quiz not generated — ${quizResult.value.error}`,
      );
    }

    if (videoResult.status === "rejected") {
      console.warn(`[generate-slides] lesson ${lessonId}: video task failed —`, videoResult.reason);
    } else if (videoResult.value.status === "ERROR") {
      console.warn(
        `[generate-slides] lesson ${lessonId}: video not generated — ${videoResult.value.error}`,
      );
    }

    console.log(`[generate-slides] lesson ${lessonId} finished`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "deck generation failed";
    console.error(`[generate-slides] lesson ${lessonId}: deck agent failed — ${message}`);
    await db.slide
      .updateMany({ where: { id: { in: pendingIds } }, data: { status: "ERROR" } })
      .catch(() => undefined);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateSlidesRequest;
    if (!body.lessonId) {
      return NextResponse.json({ success: false, error: "lessonId is required" }, { status: 400 });
    }

    try {
      await requireLessonOwner(body.lessonId);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const lesson = await db.lesson.findUnique({
      where: { id: body.lessonId },
      include: { slides: { orderBy: { order: "asc" } } },
    });
    if (!lesson) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    const retryable = lesson.slides.filter((slide) => isRetryable(slide.status, slide.updatedAt));
    if (retryable.length === 0) {
      return NextResponse.json(
        { success: false, error: "Every slide in this lesson is already generated" },
        { status: 400 },
      );
    }

    after(async () => {
      await generateDeck(body.lessonId, body.language).catch((error) =>
        console.error("[generate-slides] background generation failed:", error),
      );
    });

    return NextResponse.json({
      success: true,
      data: {
        lessonId: body.lessonId,
        totalSlides: lesson.slides.length,
        pending: retryable.length,
        status: "generating",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start slide generation";
    console.error("[generate-slides] POST error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
