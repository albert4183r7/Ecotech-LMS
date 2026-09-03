import { after, NextRequest, NextResponse } from "next/server";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "@/lib/db";
import { AuthorizationError, requireCourseOwner } from "@/lib/session";
import { sanitizeHtml, wrapSlideHtml } from "@/lib/sanitize";
import { importPptx } from "@/lib/slides/import/pptx";
import { generateAndSaveQuiz } from "@/lib/quiz/persist";
import { AI_GENERATION_RULE, consumeAuthenticatedRequest } from "@/lib/rate-limit";

// ============================================
// POST /api/lessons/import-pptx
//
// A lesson from a deck the instructor already has.
//
// Not everything worth teaching needs writing: a team with a deck it already
// uses should be able to teach from it here, keep it in the course beside the
// generated lessons, and have the quiz built from what the deck actually says.
// The slides are imported as they were drawn rather than reinterpreted — the
// reason to upload a deck is that it is already right.
//
// The quiz is a choice, not a consequence. Some uploads are reference material
// nobody should be tested on, so it is generated only when asked for, and it
// lands in the same review screen a generated quiz does: previewed and edited
// before the course is published.
// ============================================

/** Where an uploaded deck and its pictures live, under public/. */
const DECK_DIR = path.join(process.cwd(), "public", "uploads", "decks");

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_SLIDES = 80;

/** Pictures the browser will not draw, or should not be handed raw. */
async function toWebImage(
  name: string,
  bytes: Uint8Array,
): Promise<{ name: string; data: Buffer }> {
  const lower = name.toLowerCase();
  // SVG is rasterised rather than served: it is the one image format that can
  // carry script, and PowerPoint stores every vector icon as one.
  // EMF and WMF are Windows metafiles, which no browser draws at all.
  if (lower.endsWith(".svg") || lower.endsWith(".emf") || lower.endsWith(".wmf")) {
    try {
      const png = await sharp(Buffer.from(bytes), { density: 300 })
        .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      return { name: `${name.replace(/\.[^.]+$/, "")}.png`, data: png };
    } catch {
      return { name: `${name}.png`, data: Buffer.from(bytes) };
    }
  }
  return { name, data: Buffer.from(bytes) };
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const courseId = String(form.get("courseId") ?? "");
    const file = form.get("file");
    const askedForQuiz = String(form.get("generateQuiz") ?? "") === "true";
    const askedQuestions = Number(form.get("questionCount") ?? "");
    const givenTitle = String(form.get("title") ?? "").trim();

    if (!courseId || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "courseId and a .pptx file are required" },
        { status: 400 },
      );
    }

    // Importing writes a lesson into somebody's course, so the caller owns it.
    let ownerId: string;
    try {
      ownerId = (await requireCourseOwner(courseId)).id;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    if (askedForQuiz) {
      const limited = consumeAuthenticatedRequest(
        request.headers,
        ownerId,
        "ai:import-quiz",
        AI_GENERATION_RULE,
      );
      if (!limited.allowed) {
        return NextResponse.json(
          { success: false, error: "Too many quiz generations. Please try again later." },
          { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
        );
      }
    }

    if (!file.name.toLowerCase().endsWith(".pptx")) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Only .pptx files can be imported. Save an older .ppt as .pptx in PowerPoint first.",
        },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { success: false, error: `That deck is larger than ${MAX_BYTES / 1024 / 1024}MB.` },
        { status: 400 },
      );
    }

    // One directory per upload: the deck itself, so an instructor can download
    // what they gave us, and its pictures beside it.
    const deckId = randomUUID();
    const dir = path.join(DECK_DIR, deckId);
    await mkdir(dir, { recursive: true });

    const bytes = Buffer.from(await file.arrayBuffer());
    const sourceName = `source.pptx`;
    await writeFile(path.join(dir, sourceName), bytes);

    let deck;
    try {
      deck = await importPptx(bytes, {
        async saveMedia(name, data) {
          const image = await toWebImage(name, data);
          await writeFile(path.join(dir, image.name), image.data);
          return `/uploads/decks/${deckId}/${image.name}`;
        },
      });
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      const message =
        error instanceof Error ? error.message : "That file could not be read as a presentation.";
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    if (deck.slides.length > MAX_SLIDES) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      return NextResponse.json(
        {
          success: false,
          error: `That deck has ${deck.slides.length} slides; ${MAX_SLIDES} is the most a single lesson can hold. Split it into several files.`,
        },
        { status: 400 },
      );
    }

    if (deck.slides.length === 0) {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      return NextResponse.json(
        {
          success: false,
          error:
            deck.hidden > 0
              ? `Every slide in that deck is hidden in PowerPoint, so there is nothing to teach from. Unhide the ones you want and upload it again.`
              : "That presentation has no slides in it.",
        },
        { status: 400 },
      );
    }

    const title = (givenTitle || deck.title || file.name.replace(/\.pptx$/i, "")).slice(0, 120);
    const warnings = deck.slides.flatMap((s, i) => s.warnings.map((w) => `slide ${i + 1}: ${w}`));

    const lesson = await db.lesson.create({
      data: {
        courseId,
        title,
        order: await db.lesson.count({ where: { courseId } }),
        // No plan was made, so what is recorded is where the lesson came from.
        // The stored file is what makes "download the original" possible and
        // tells a later reader why this lesson has no outline.
        outlineJson: JSON.stringify({
          source: {
            kind: "upload",
            file: `/uploads/decks/${deckId}/${sourceName}`,
            originalName: file.name,
            importedAt: new Date().toISOString(),
          },
          title,
          slideCount: deck.slides.length,
          hiddenSlides: deck.hidden,
          warnings,
        }),
      },
    });

    await db.slide.createMany({
      data: deck.slides.map((slide, index) => ({
        lessonId: lesson.id,
        title: slide.title.slice(0, 90) || `Slide ${index + 1}`,
        // Sanitised on the way in, like every other slide: this markup was
        // built from a file a user supplied.
        htmlBody: wrapSlideHtml(sanitizeHtml(slide.html), { title: slide.title }),
        status: "READY",
        order: index,
      })),
    });

    // The quiz runs in the background, exactly as it does for a generated
    // lesson, and the review screen shows it as pending until it is written.
    if (askedForQuiz) {
      await db.quiz.upsert({
        where: { lessonId: lesson.id },
        create: { lessonId: lesson.id, title: "Quiz", status: "DRAFT", error: null },
        update: { status: "DRAFT", error: null },
      });
      after(() =>
        generateAndSaveQuiz(lesson.id, {
          questionCount:
            Number.isFinite(askedQuestions) && askedQuestions > 0 ? askedQuestions : null,
        }).catch((error) => console.error(`[import-pptx] quiz for ${lesson.id} failed:`, error)),
      );
    }

    console.log(
      `[import-pptx] ${file.name}: ${deck.slides.length} slide(s) into lesson ${lesson.id}` +
        (deck.hidden ? `, ${deck.hidden} hidden slide(s) skipped` : "") +
        (warnings.length ? `, ${warnings.length} warning(s)` : "") +
        (askedForQuiz ? ", quiz requested" : ""),
    );

    return NextResponse.json({
      success: true,
      data: {
        lessonId: lesson.id,
        courseId,
        title,
        slideCount: deck.slides.length,
        hiddenSlides: deck.hidden,
        quiz: askedForQuiz ? "generating" : "none",
        warnings,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The deck could not be imported";
    console.error("[import-pptx] error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
