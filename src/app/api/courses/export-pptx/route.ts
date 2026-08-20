import { NextRequest, NextResponse } from "next/server";
import PptxGenJS from "pptxgenjs";
import { db } from "@/lib/db";
import { extractSlideLayout, type SlideLayout } from "@/lib/render/slide-layout";
import { ensureCanvasDocument } from "@/lib/sanitize";

interface SlideHtmlBody {
  title: string;
  htmlBody: string;
}

interface GeneratePptxRequest {
  courseId?: string;
  slides?: SlideHtmlBody[];
  courseName: string;
}

// ─── Ecotech Brand Colors ──────────────────────────
const PRIMARY = "4A6FA5";
const TEAL = "5B9A8F";
const LIGHT_BG = "F5F8FA";
const DARK_TEXT = "1F2937";
const BODY_TEXT = "5A6B7D";
const WHITE = "FFFFFF";

/** Strip HTML tags and decode entities */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

/** Extract text content from HTML, returning structured chunks */
function extractContent(html: string): { title: string; paragraphs: string[] } {
  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;

  // Try to find the first h1 as title
  const h1Match = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? stripHtml(h1Match[1]) : "";

  // Extract text from h2, h3, p, li elements
  const paragraphs: string[] = [];
  const blockRegex = /<(h[23]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = blockRegex.exec(bodyHtml)) !== null) {
    const text = stripHtml(match[2]);
    if (text) paragraphs.push(text);
  }

  // If no paragraphs found, try a broader extraction
  if (paragraphs.length === 0) {
    const fallback = stripHtml(bodyHtml);
    if (fallback) paragraphs.push(fallback);
  }

  return { title, paragraphs };
}

/** Add a consistent footer with brand text and slide number */
function addFooter(s: ReturnType<PptxGenJS["addSlide"]>, slideNum: number, totalSlides: number) {
  s.addShape("rect" as never, {
    x: 0,
    y: 7.12,
    w: "100%",
    h: 0.04,
    fill: { color: TEAL },
  });
  s.addText(`${slideNum} / ${totalSlides}`, {
    x: 6.5,
    y: 7.15,
    w: 1.8,
    h: 0.3,
    fontSize: 7,
    fontFace: "Arial",
    color: BODY_TEXT,
    align: "right",
  });
  s.addText("Ecotech", {
    x: 8.3,
    y: 7.15,
    w: 1.5,
    h: 0.3,
    fontSize: 7,
    fontFace: "Arial",
    color: BODY_TEXT,
    align: "right",
    italic: true,
  });
}

/** Add the standard slide header with accent bar */
function addSlideHeader(s: ReturnType<PptxGenJS["addSlide"]>, title: string) {
  s.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: "100%",
    h: 0.06,
    fill: { color: PRIMARY },
  });
  s.addText(title, {
    x: 0.6,
    y: 0.3,
    w: 8.8,
    h: 0.7,
    fontSize: 24,
    fontFace: "Arial",
    color: PRIMARY,
    bold: true,
  });
  s.addShape("rect" as never, {
    x: 0.6,
    y: 1.05,
    w: 1.2,
    h: 0.04,
    fill: { color: TEAL },
  });
}

/** Add a content slide from extracted HTML content */
function addHtmlSlide(
  pptx: PptxGenJS,
  lessonTitle: string,
  { title, paragraphs }: { title: string; paragraphs: string[] },
  slideNum: number,
  totalSlides: number,
) {
  const s = pptx.addSlide();
  s.background = { fill: WHITE };
  addSlideHeader(s, title || lessonTitle);

  // Build text objects from paragraphs
  const textObjs: Array<{ text: string; options?: Record<string, unknown> }> = [];

  for (const p of paragraphs) {
    // Heuristic: short paragraphs are likely headings
    const isShort = p.length < 80 && !p.endsWith(".");
    textObjs.push({
      text: p,
      options: {
        fontSize: isShort ? 14 : 12,
        bold: isShort,
        color: isShort ? DARK_TEXT : BODY_TEXT,
        paraSpaceBefore: isShort ? 12 : 4,
        paraSpaceAfter: 4,
      },
    });
  }

  if (textObjs.length > 0) {
    s.addText(textObjs, {
      x: 0.6,
      y: 1.3,
      w: 8.8,
      h: 5.5,
      fontFace: "Arial",
      valign: "top",
      lineSpacingMultiple: 1.3,
    });
  }

  addFooter(s, slideNum, totalSlides);
}

// ─── Main POST Handler ───────────────────────────
// ============================================
// Design-preserving slide construction
//
// The previous export ran stripHtml over the slide and re-typed the result
// onto one fixed template, so every layout decision was discarded and the
// download looked nothing like the slide on screen. This rebuilds the slide
// from its real geometry, keeping text editable in PowerPoint rather than
// flattening it to a picture.
// ============================================

/** 16:9 at pptxgenjs LAYOUT_16x9. */
const DECK_W_IN = 10;
const DECK_H_IN = 5.625;

function addLayoutSlide(pptx: PptxGenJS, layout: SlideLayout, title: string) {
  const s = pptx.addSlide();

  // A slide's real background is usually painted by a full-bleed element
  // rather than the canvas itself. Promote the last such fill to the slide
  // background: without this a dark gradient slide exported as white, and its
  // white text became invisible.
  const fullBleed = layout.shapes.filter((sh) => sh.w > 0.98 && sh.h > 0.98);
  s.background = { color: fullBleed.at(-1)?.fill ?? layout.background };

  // Background blocks next, in DOM order, so text lands on top of them.
  for (const shape of layout.shapes) {
    // Full-bleed fills already became the slide background.
    if (shape.w > 0.98 && shape.h > 0.98) continue;
    s.addShape("roundRect", {
      x: shape.x * DECK_W_IN,
      y: shape.y * DECK_H_IN,
      w: shape.w * DECK_W_IN,
      h: shape.h * DECK_H_IN,
      fill: { color: shape.fill },
      line: { color: shape.fill, width: 0 },
      rectRadius: Math.min(0.2, Math.max(0, shape.radius) * DECK_W_IN * shape.w),
    });
  }

  for (const text of layout.texts) {
    s.addText(text.text, {
      x: text.x * DECK_W_IN,
      y: text.y * DECK_H_IN,
      w: Math.max(0.4, text.w * DECK_W_IN),
      h: Math.max(0.2, text.h * DECK_H_IN),
      fontSize: text.fontSize,
      bold: text.bold,
      italic: text.italic,
      color: text.color,
      align: text.align,
      valign: "top",
      margin: 0,
      shrinkText: true,
    });
  }

  if (!layout.texts.length) s.addNotes(`Slide "${title}" rendered no text.`);
  return s;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeneratePptxRequest;
    const { courseId, slides, courseName } = body;

    // Resolve slides: either from DB by courseId or from the request body
    let resolvedSlides: SlideHtmlBody[] | undefined = slides;

    if (!resolvedSlides && courseId) {
      const dbLessons = await db.lesson.findMany({
        where: { courseId },
        orderBy: { order: "asc" },
        include: {
          slides: {
            where: { status: "READY" },
            orderBy: { order: "asc" },
            select: { title: true, htmlBody: true },
          },
        },
      });
      resolvedSlides = dbLessons.flatMap((l) =>
        l.slides.map((s) => ({ title: s.title, htmlBody: s.htmlBody })),
      );
    }

    if (!resolvedSlides || !Array.isArray(resolvedSlides) || resolvedSlides.length === 0) {
      return NextResponse.json(
        { error: "No slides found. Provide slides array or a valid courseId." },
        { status: 400 },
      );
    }

    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_16x9";
    pptx.author = "Ecotech LMS";
    pptx.title = courseName || "Lesson";
    pptx.subject = `Generated by Ecotech LMS: ${courseName || "Lesson"}`;

    const totalSlides = resolvedSlides.length;

    for (let i = 0; i < resolvedSlides.length; i++) {
      const slide = resolvedSlides[i];
      try {
        const layout = await extractSlideLayout(ensureCanvasDocument(slide.htmlBody, slide.title));
        addLayoutSlide(pptx, layout, slide.title);
      } catch (err) {
        // Never fail the whole download because one slide could not be read.
        console.error(`[export-pptx] slide ${i + 1} layout failed, using text fallback:`, err);
        addHtmlSlide(pptx, slide.title, extractContent(slide.htmlBody), i + 1, totalSlides);
      }
    }

    const safeName = (courseName || "lesson")
      .replace(/[^a-zA-Z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60);

    const buffer: Buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${safeName}.pptx"`,
      },
    });
  } catch (error) {
    console.error("PPTX generation error:", error);
    return NextResponse.json({ error: "Failed to generate PPTX" }, { status: 500 });
  }
}
