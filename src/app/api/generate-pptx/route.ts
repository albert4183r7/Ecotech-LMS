import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';
import { db } from '@/lib/db';

interface SectionHtmlBody {
  title: string;
  htmlBody: string;
}

interface GeneratePptxRequest {
  courseId?: string;
  sections?: SectionHtmlBody[];
  slides?: Array<Record<string, unknown>>; // legacy compat
  courseName: string;
}

// ─── Ecotech Brand Colors ──────────────────────────
const PRIMARY = '4A6FA5';
const TEAL = '5B9A8F';
const LIGHT_BG = 'F5F8FA';
const DARK_TEXT = '1F2937';
const BODY_TEXT = '5A6B7D';
const WHITE = 'FFFFFF';

/** Strip HTML tags and decode entities */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Extract text content from HTML, returning structured chunks */
function extractContent(html: string): { title: string; paragraphs: string[] } {
  // Extract body content
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;

  // Try to find the first h1 as title
  const h1Match = bodyHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? stripHtml(h1Match[1]) : '';

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
function addFooter(s: ReturnType<PptxGenJS['addSlide']>, slideNum: number, totalSlides: number) {
  s.addShape('rect' as never, {
    x: 0, y: 7.12, w: '100%', h: 0.04,
    fill: { color: TEAL },
  });
  s.addText(`${slideNum} / ${totalSlides}`, {
    x: 6.5, y: 7.15, w: 1.8, h: 0.3,
    fontSize: 7, fontFace: 'Arial',
    color: BODY_TEXT, align: 'right',
  });
  s.addText('Ecotech', {
    x: 8.3, y: 7.15, w: 1.5, h: 0.3,
    fontSize: 7, fontFace: 'Arial',
    color: BODY_TEXT, align: 'right', italic: true,
  });
}

/** Add the standard slide header with accent bar */
function addSlideHeader(s: ReturnType<PptxGenJS['addSlide']>, title: string) {
  s.addShape('rect' as never, {
    x: 0, y: 0, w: '100%', h: 0.06,
    fill: { color: PRIMARY },
  });
  s.addText(title, {
    x: 0.6, y: 0.3, w: 8.8, h: 0.7,
    fontSize: 24, fontFace: 'Arial',
    color: PRIMARY, bold: true,
  });
  s.addShape('rect' as never, {
    x: 0.6, y: 1.05, w: 1.2, h: 0.04,
    fill: { color: TEAL },
  });
}

/** Add a content slide from extracted HTML content */
function addHtmlSlide(
  pptx: PptxGenJS,
  sectionTitle: string,
  { title, paragraphs }: { title: string; paragraphs: string[] },
  slideNum: number,
  totalSlides: number,
) {
  const s = pptx.addSlide();
  s.background = { fill: WHITE };
  addSlideHeader(s, title || sectionTitle);

  // Build text objects from paragraphs
  const textObjs: Array<{ text: string; options?: Record<string, unknown> }> = [];

  for (const p of paragraphs) {
    // Heuristic: short paragraphs are likely headings
    const isShort = p.length < 80 && !p.endsWith('.');
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
      x: 0.6, y: 1.3, w: 8.8, h: 5.5,
      fontFace: 'Arial', valign: 'top',
      lineSpacingMultiple: 1.3,
    });
  }

  addFooter(s, slideNum, totalSlides);
}

// ─── Main POST Handler ───────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeneratePptxRequest;
    const { courseId, sections, courseName } = body;

    // Resolve sections: either from DB by courseId or from the request body
    let resolvedSections: SectionHtmlBody[] | undefined = sections;

    if (!resolvedSections && courseId) {
      const dbLessons = await db.lesson.findMany({
        where: { courseId },
        orderBy: { order: 'asc' },
        include: {
          slides: {
            where: { status: 'READY' },
            orderBy: { order: 'asc' },
            select: { title: true, htmlBody: true },
          },
        },
      });
      resolvedSections = dbLessons.flatMap((l) =>
        l.slides.map((s) => ({ title: s.title, htmlBody: s.htmlBody }))
      );
    }

    if (!resolvedSections || !Array.isArray(resolvedSections) || resolvedSections.length === 0) {
      return NextResponse.json({ error: 'No sections found. Provide sections array or a valid courseId.' }, { status: 400 });
    }

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Ecotech LMS';
    pptx.title = courseName || 'Lesson';
    pptx.subject = `Generated by Ecotech LMS: ${courseName || 'Lesson'}`;

    const totalSlides = resolvedSections.length;

    for (let i = 0; i < resolvedSections.length; i++) {
      const section = resolvedSections[i];
      const content = extractContent(section.htmlBody);
      addHtmlSlide(pptx, section.title, content, i + 1, totalSlides);
    }

    const safeName = (courseName || 'lesson')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60);

    const buffer: Buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${safeName}.pptx"`,
      },
    });
  } catch (error) {
    console.error('PPTX generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PPTX' },
      { status: 500 }
    );
  }
}
