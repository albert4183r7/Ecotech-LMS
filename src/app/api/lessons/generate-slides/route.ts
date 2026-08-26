import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireLessonOwner, AuthorizationError } from "@/lib/session";
import { sanitizeHtml, wrapSlideHtml } from "@/lib/sanitize";
import { isRetryable, SLIDE_ATTEMPTS } from "@/lib/slide-status";
import { CONTENTS_FROM } from "@/lib/presentation-plan";
import { renderComposition } from "@/lib/slides/composition-render";
import { generateSlideComposition, summariseComposition } from "@/lib/slides/composition-generate";
import { compositionTitle } from "@/lib/slides/composition";
import { parseSlideDoc, slideDocText } from "@/lib/slides/document";
import type { SlideBrief } from "@/lib/slides/generate";
import { generateAndSaveQuiz } from "@/lib/quiz/persist";
import { runQualityGate } from "@/lib/agent/quality-gate";

// ============================================
// POST /api/lessons/generate-slides   — phase two
//
// Turns the approved section plan into slides. The plan the user reviewed is
// the source of truth: every section is generated, in order, and the slide
// count is whatever the plan allocated. Nothing is re-planned here.
// ============================================

const SLIDE_TIMEOUT_MS = 120_000;

/**
 * Slides written at once.
 *
 * They were written strictly one after another, so a twelve-slide lesson cost
 * twelve round trips end to end and the instructor waited through all of them.
 * The slides are independent — each owns its row and its share of the section's
 * points — so the only thing serialising them bought was a fuller "already
 * covered" list, and that is a safety net rather than the mechanism that keeps
 * them distinct: the plan assigns each slide its own points.
 */
const SLIDE_CONCURRENCY = Math.max(1, Number(process.env.SLIDE_CONCURRENCY ?? 3));

/** Run over items with at most `limit` in flight, preserving no order. */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        await worker(items[cursor++]);
      }
    }),
  );
}

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
  /** What the plan decided about who it is for and what it argues. */
  audience?: string;
  thesis?: string;
  misconception?: string;
  keyTerms?: string[];
  /** How many quiz questions the instructor asked for, when they said. */
  quizQuestionCount?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function generateAllSlides(lessonId: string, languageOverride?: string): Promise<void> {
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

  const language = languageOverride ?? plan.language ?? lesson.course?.language ?? "english";
  // The template the lesson was planned with. Resolved from the stored outline
  // so every re-render of a slide keeps the look it was generated with.
  const deck = lesson.slides;
  const pending = deck.filter((s) => isRetryable(s.status, s.updatedAt));

  if (pending.length === 0) {
    console.log(`[generate-slides] lesson ${lessonId}: nothing pending`);
    return;
  }

  // Sections come from the database, which holds exactly what the user
  // approved. The outline JSON is only a fallback for older lessons.
  // Claim and vehicle live in the stored plan rather than on the Section row,
  // so they are matched back by title — the two lists are written together and
  // in the same order.
  const plannedByTitle = new Map((plan.sections ?? []).map((s) => [s.title, s]));
  const sections: StoredSection[] = lesson.sections.length
    ? lesson.sections.map((s) => ({
        title: s.title,
        summary: s.summary,
        subtopics: JSON.parse(s.subtopics) as string[],
        slideBudget: s.slideBudget,
        claim: plannedByTitle.get(s.title)?.claim,
        vehicle: plannedByTitle.get(s.title)?.vehicle,
      }))
    : (plan.sections ?? []);

  const sectionById = new Map(lesson.sections.map((s) => [s.id, s]));

  // The deck's furniture: a cover, a contents slide, and a closing. They carry
  // no section's points — they are the frame around the teaching slides.
  const roleAt = (position: number): SlideBrief["role"] =>
    position === 0
      ? "cover"
      : position === 1 && deck.length >= CONTENTS_FROM
        ? "contents"
        : position === deck.length - 1
          ? "closing"
          : "content";

  // Every section owns exactly one teaching slide, so its points all land
  // there — no dealing, and no two slides written from the same section.
  const subtopicsForSlide = new Map<string, string[]>();
  for (const section of lesson.sections) {
    const owned = deck.filter(
      (s) => s.sectionId === section.id && roleAt(deck.indexOf(s)) === "content",
    );
    const topics = JSON.parse(section.subtopics) as string[];
    // A section with more than one slide only happens in a lesson planned
    // before one-section-one-slide; those keep contiguous runs, which is what
    // stops an argument being split down the middle.
    const perSlide = Math.ceil(topics.length / Math.max(1, owned.length));
    owned.forEach((slide, i) => {
      subtopicsForSlide.set(slide.id, topics.slice(i * perSlide, (i + 1) * perSlide));
    });
  }

  /** What the contents slide lists: the lesson's sections, in order. */
  const contentsList = lesson.sections.map((s) => s.title);

  console.log(
    `[generate-slides] lesson ${lessonId}: ${pending.length} pending of ${deck.length} slides, ${sections.length} sections`,
  );

  // Seed context with slides that are already finished.
  const covered: string[] = deck
    .filter((s) => s.status === "READY" && s.contentJson)
    .map((s) => {
      const doc = parseSlideDoc(s.contentJson);
      return doc ? slideDocText(doc).slice(0, 240) : s.title;
    });

  /** Arrangements already used, so the composer can do something else. */
  const usedLayouts: string[] = [];

  const generateOne = async (slide: (typeof pending)[number]) => {
    const position = deck.findIndex((s) => s.id === slide.id);
    const label = `${position + 1}/${deck.length}`;
    const section = slide.sectionId ? sectionById.get(slide.sectionId) : undefined;
    const sectionIndex = section ? section.order : 0;
    const owned = deck.filter((s) => s.sectionId === slide.sectionId);
    const positionInSection = Math.max(1, owned.findIndex((s) => s.id === slide.id) + 1);

    const role = roleAt(position);

    const planned = section ? plannedByTitle.get(section.title) : sections[sectionIndex];

    const brief: SlideBrief = {
      position: position + 1,
      totalSlides: deck.length,
      presentationTitle: plan.title ?? lesson.title,
      presentationSubtitle: plan.subtitle ?? "",
      sectionTitle: section?.title ?? sections[sectionIndex]?.title ?? lesson.title,
      sectionSummary: section?.summary ?? sections[sectionIndex]?.summary ?? "",
      subtopics: role === "contents" ? contentsList : (subtopicsForSlide.get(slide.id) ?? []),
      role,
      language,
      // The lesson's brief, so a slide knows what it is arguing and for whom.
      // Without these the model had a section title and a few words of
      // subtopic to fill a whole slide from.
      audience: plan.audience,
      thesis: plan.thesis,
      misconception: plan.misconception,
      keyTerms: plan.keyTerms,
      // The title the plan gave this particular slide. Without it, every slide
      // of a two-slide section invented a heading from the same section
      // summary, and the pair came out looking like the same slide twice.
      plannedTitle: slide.title,
      positionInSection,
      slidesInSection: owned.length,
      sectionClaim: planned?.claim,
      sectionVehicle: planned?.vehicle,
      alreadyCovered: covered.length ? covered.slice(-8).join("\n") : undefined,
      // What the finished slides came out looking like, so this one is not the
      // third row of three cards in a row.
      avoidLayouts: usedLayouts.slice(-4),
      referenceText: plan.referenceContext,
    };

    try {
      await db.slide.update({ where: { id: slide.id }, data: { status: "GENERATING" } });
    } catch (error) {
      console.error(`[generate-slides] status update failed for ${slide.id}:`, error);
    }

    let done = false;
    let lastError = "";

    for (let attempt = 1; attempt <= SLIDE_ATTEMPTS && !done; attempt++) {
      try {
        // The model composes the slide: which shapes it needs, where they go
        // and what each one says. It cannot name a colour, a font or a point
        // size — every one of those is a role that resolves to the template's
        // own value — so an arrangement can be anything and the deck is still
        // the Ecotech deck.
        const composition = await withTimeout(
          generateSlideComposition(brief),
          SLIDE_TIMEOUT_MS,
          `slide ${label}`,
        );

        const html = sanitizeHtml(renderComposition(composition, { slideNumber: position + 1 }));
        if (!html.trim()) throw new Error("rendered slide was empty after sanitising");

        const title = compositionTitle(composition) ?? slide.title;

        await db.slide.update({
          where: { id: slide.id },
          data: {
            htmlBody: wrapSlideHtml(html, { title }),
            contentJson: JSON.stringify(composition),
            title,
            status: "READY",
          },
        });

        covered.push(summariseComposition(composition));
        if (composition.layoutNote) usedLayouts.push(composition.layoutNote);
        console.log(
          `[generate-slides] slide ${label} ready (${composition.layoutNote ?? "composed"})`,
        );
        done = true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "slide generation failed";
        console.error(`[generate-slides] slide ${label} attempt ${attempt}: ${lastError}`);
        if (attempt < SLIDE_ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }

    if (!done) {
      console.error(`[generate-slides] slide ${label} exhausted attempts: ${lastError}`);
      await db.slide
        .update({ where: { id: slide.id }, data: { status: "ERROR" } })
        .catch(() => undefined);
    }
  };

  await withConcurrency(pending, SLIDE_CONCURRENCY, generateOne);

  // ---- Validate what was produced against what was approved ----
  const finished = await db.slide.findMany({
    where: { lessonId },
    orderBy: { order: "asc" },
  });
  const ready = finished.filter((s) => s.status === "READY");
  const missingSections = lesson.sections.filter(
    (section) => !ready.some((s) => s.sectionId === section.id),
  );

  if (ready.length !== finished.length) {
    console.warn(
      `[generate-slides] lesson ${lessonId}: ${ready.length}/${finished.length} slides ready`,
    );
  }
  if (missingSections.length) {
    console.warn(
      `[generate-slides] lesson ${lessonId}: no slide produced for section(s) ${missingSections
        .map((s) => `"${s.title}"`)
        .join(", ")}`,
    );
  }

  // ---- Mark the lesson as still in progress ----
  //
  // Review and quiz generation run here, after the last slide has reported
  // READY, and take about as long as the slides did. Nothing recorded that,
  // so a page watching the lesson saw a finished deck and no way to tell
  // whether anything was still coming. A quiz row in its DRAFT state says so:
  // it is the state the schema already defines for a quiz that is not yet
  // answerable, and every reader of a quiz requires READY before showing it.
  if (ready.length > 0) {
    await db.quiz
      .upsert({
        where: { lessonId },
        create: { lessonId, title: "Quiz", status: "DRAFT", error: null },
        update: { status: "DRAFT", error: null },
      })
      .catch((error) => {
        console.warn(`[generate-slides] lesson ${lessonId}: could not mark quiz pending —`, error);
      });
  }

  // ---- Review what was generated, and revise what fails ----
  //
  // The workflow decides that slides are followed by review and review by the
  // quiz. The gate decides only what is wrong and how to say it better; it
  // never chooses what happens next. Bounded passes, and a failure to evaluate
  // leaves the slides as they are rather than failing the lesson.
  if (ready.length > 0) {
    try {
      const gate = await runQualityGate({
        lessonId,
        audience: plan.topic,
        referenceText: plan.referenceContext,
        onProgress: (message) => console.log(`[generate-slides] ${message}`),
      });
      const revised = gate.passes.reduce((n, p) => n + p.revisedSlides.length, 0);
      console.log(
        `[generate-slides] lesson ${lessonId}: review ${gate.passed ? "passed" : "did not pass"}` +
          ` after ${gate.passes.length} pass(es), ${revised} slide(s) revised` +
          (gate.remaining.length ? `, ${gate.remaining.length} finding(s) outstanding` : ""),
      );
    } catch (error) {
      console.warn(
        `[generate-slides] lesson ${lessonId}: review skipped —`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  // ---- The quiz is part of generating a lesson, not a separate action ----
  //
  // It runs last because it is written from the finished slides: the quiz has
  // to be grounded in what the lesson actually says, which is not known until
  // the slides exist. A lesson with no ready slides has nothing to quiz on, so
  // the attempt is skipped rather than failed.
  if (ready.length > 0) {
    const result = await generateAndSaveQuiz(lessonId, {
      questionCount: plan.quizQuestionCount,
    });
    if (result.status === "ERROR") {
      // Recorded on the quiz row, so the instructor sees it and can retry
      // without regenerating slides that came out fine.
      console.warn(`[generate-slides] lesson ${lessonId}: quiz not generated — ${result.error}`);
    }
  } else {
    console.warn(`[generate-slides] lesson ${lessonId}: no ready slides, skipping quiz`);
  }

  console.log(`[generate-slides] lesson ${lessonId} finished`);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateSlidesRequest;
    if (!body.lessonId) {
      return NextResponse.json({ success: false, error: "lessonId is required" }, { status: 400 });
    }

    // Generation is expensive and writes to the instructor's lesson, so the
    // caller has to own it.
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

    const retryable = lesson.slides.filter((s) => isRetryable(s.status, s.updatedAt));
    if (retryable.length === 0) {
      return NextResponse.json(
        { success: false, error: "Every slide in this lesson is already generated" },
        { status: 400 },
      );
    }

    generateAllSlides(body.lessonId, body.language).catch((err) =>
      console.error("[generate-slides] background generation failed:", err),
    );

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
