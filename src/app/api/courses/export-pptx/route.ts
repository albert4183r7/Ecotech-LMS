import { NextRequest, NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { db } from "@/lib/db";
import { AuthorizationError, mayReadLesson, requireUser } from "@/lib/session";
import { parseSlideDoc, type SlideDoc } from "@/lib/slides/document";
import { addContentSlide, applyTemplateLayout } from "@/lib/slides/pptx";
import { addCompositionSlide, prepareCompositionAssets } from "@/lib/slides/composition-pptx";
import { applyGradients } from "@/lib/slides/pptx-gradient";
import { SLIDE_TEMPLATE } from "@/lib/slides/template";
import { safeFileName } from "@/lib/download";

// ============================================
// POST /api/courses/export-pptx
//
// Builds a deck from the same structured slide content the web renderer uses,
// through the same template. The export used to rasterise each web slide with
// headless Chromium and rebuild it from the rectangles and text runs it could
// recover, which approximated the design, dropped anything without a
// background fill, and needed a browser to produce a file.
//
// A lesson is one deck. Exporting a whole course produces one file per lesson;
// the client zips them.
// ============================================

interface ExportRequest {
  /** Export one lesson. Preferred: a deck is a lesson, not a course. */
  lessonId?: string;
  /** Export a specific set of slides, by id, in the order given. */
  slideIds?: string[];
  /** Title for the file and its document properties. */
  deckName?: string;
}

interface DeckSlide {
  title: string;
  doc: SlideDoc;
}

/**
 * Read stored slides, skipping any that cannot be.
 *
 * Either slide model exports: a composed slide is drawn shape by shape, and a
 * slide from a lesson generated before compositions still goes through the
 * template layouts. Slides authored before both exist only as HTML and are
 * reported rather than silently dropped.
 */
function toDeckSlides(rows: { title: string; contentJson: string | null }[]): {
  slides: DeckSlide[];
  skipped: number;
} {
  const slides: DeckSlide[] = [];
  let skipped = 0;

  for (const row of rows) {
    const doc = parseSlideDoc(row.contentJson);
    if (!doc) {
      skipped++;
      continue;
    }
    slides.push({ title: row.title, doc });
  }

  return { slides, skipped };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExportRequest;

    if (!body.lessonId && !body.slideIds?.length) {
      return NextResponse.json({ error: "lessonId or slideIds is required" }, { status: 400 });
    }

    // A deck is the lesson's full content, so exporting one is reading it:
    // allowed for the course's instructor, or for a student enrolled in a
    // published course. Anyone else gets not-found.
    const user = await requireUser();

    let rows: { title: string; contentJson: string | null; order: number }[] = [];
    let deckName = body.deckName ?? "lesson";

    if (body.lessonId) {
      const lesson = await db.lesson.findUnique({
        where: { id: body.lessonId },
        include: {
          slides: {
            where: { status: "READY" },
            orderBy: { order: "asc" },
            select: { title: true, contentJson: true, order: true },
          },
        },
      });
      if (!lesson || !(await mayReadLesson(body.lessonId, user.id))) {
        return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
      }
      rows = lesson.slides;
      deckName = body.deckName ?? lesson.title;
    } else {
      const found = await db.slide.findMany({
        where: { id: { in: body.slideIds ?? [] }, status: "READY" },
        select: { id: true, title: true, contentJson: true, order: true, lessonId: true },
      });
      // Preserve the order the caller asked for rather than the database's.
      const byId = new Map(found.map((s) => [s.id, s]));
      rows = (body.slideIds ?? []).flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });
      // Slide ids may name more than one lesson, so check every one of them:
      // checking only the first would let a readable slide carry unreadable
      // ones into the same deck.
      const lessonIds = [...new Set(found.map((row) => row.lessonId))];
      const readable = await Promise.all(lessonIds.map((id) => mayReadLesson(id, user.id)));
      if (readable.some((allowed) => !allowed)) {
        return NextResponse.json({ error: "Slides not found" }, { status: 404 });
      }
    }

    const { slides, skipped } = toDeckSlides(rows);
    if (slides.length === 0) {
      return NextResponse.json(
        {
          error: skipped
            ? "These slides were generated before the current slide format and cannot be exported. Regenerate the lesson to export it."
            : "No generated slides found to export.",
        },
        { status: 400 },
      );
    }
    if (skipped) {
      console.warn(`[export-pptx] ${skipped} slide(s) skipped: no structured content`);
    }

    const template = SLIDE_TEMPLATE;
    const pptx = new PptxGenJS();
    applyTemplateLayout(pptx, template);
    pptx.author = "Ecotech LMS";
    pptx.title = deckName;
    pptx.subject = `Generated by Ecotech LMS: ${deckName}`;

    // The template numbers its own pages; the deck name is document metadata,
    // not slide furniture.
    const allWarnings: string[] = [];
    // Adding slides stays sequential to preserve deck order, but icon
    // rasterisation is independent. Warm every composition's assets together
    // so export time is not the sum of each slide's Sharp work.
    await Promise.all(
      slides.flatMap((slide) =>
        slide.doc.kind === "composition"
          ? [prepareCompositionAssets(slide.doc.composition, template)]
          : [],
      ),
    );
    // Sequential, because slide order is the order they are added — and
    // prepared assets are now served from the shared cache.
    for (const [index, slide] of slides.entries()) {
      const { warnings } =
        slide.doc.kind === "composition"
          ? await addCompositionSlide(pptx, slide.doc.composition, template, {
              slideNumber: index + 1,
            })
          : addContentSlide(pptx, slide.doc.content, template, { slideNumber: index + 1 });
      allWarnings.push(...warnings.map((w) => `slide ${index + 1}: ${w}`));
    }
    if (allWarnings.length) {
      console.warn(
        `[export-pptx] ${allWarnings.length} fitting warning(s):`,
        allWarnings.slice(0, 5),
      );
    }

    const written: Buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    // The template's gradient panels go in as a sentinel colour; this swaps
    // them for real gradient fills, which pptxgenjs cannot write itself.
    const buffer = await applyGradients(written, template);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeFileName(deckName)}.pptx"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[export-pptx] generation error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate PPTX";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
