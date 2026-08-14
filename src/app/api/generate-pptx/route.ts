import { NextRequest, NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';

interface SlideContent {
  title: string;
  type: string;
  subtitle?: string;
  items?: Array<{ heading?: string; text: string; icon?: string }>;
  tableData?: { headers: string[]; rows: string[][] };
  codeBlock?: { language: string; code: string };
}

interface GeneratePptxRequest {
  slides: SlideContent[];
  courseName: string;
}

// ─── Ecotech Brand Colors ──────────────────────────
const PRIMARY = '4A6FA5';
const TEAL = '5B9A8F';
const LIGHT_BG = 'F5F8FA';
const DARK_TEXT = '1F2937';
const BODY_TEXT = '5A6B7D';
const WHITE = 'FFFFFF';
const CODE_BG = '1E293B';
const CODE_TEXT = 'E2E8F0';
const CORRECT_BG = 'D1FAE5';
const CORRECT_TEXT = '065F46';
const BORDER_LIGHT = 'E5E7EB';

// ─── Shared helpers ──────────────────────────────

/** Add a consistent bottom bar with brand text and slide number */
function addFooter(s: ReturnType<PptxGenJS['addSlide']>, slideNum: number, totalSlides: number) {
  // Thin teal accent line
  s.addShape('rect' as never, {
    x: 0, y: 7.12, w: '100%', h: 0.04,
    fill: { color: TEAL },
  });
  // Slide number bottom right
  s.addText(`${slideNum} / ${totalSlides}`, {
    x: 6.5, y: 7.15, w: 1.8, h: 0.3,
    fontSize: 7, fontFace: 'Arial',
    color: BODY_TEXT, align: 'right',
  });
  // Brand text
  s.addText('Ecotech', {
    x: 8.3, y: 7.15, w: 1.5, h: 0.3,
    fontSize: 7, fontFace: 'Arial',
    color: BODY_TEXT, align: 'right', italic: true,
  });
}

/** Add the standard slide header with accent bar */
function addSlideHeader(s: ReturnType<PptxGenJS['addSlide']>, title: string) {
  // Primary accent bar at top
  s.addShape('rect' as never, {
    x: 0, y: 0, w: '100%', h: 0.06,
    fill: { color: PRIMARY },
  });
  // Title text
  s.addText(title, {
    x: 0.6, y: 0.3, w: 8.8, h: 0.7,
    fontSize: 24, fontFace: 'Arial',
    color: PRIMARY, bold: true,
  });
  // Thin underline bar
  s.addShape('rect' as never, {
    x: 0.6, y: 1.05, w: 1.2, h: 0.04,
    fill: { color: TEAL },
  });
}

// ─── Title Slide ─────────────────────────────────
function addTitleSlide(pptx: PptxGenJS, slide: SlideContent, courseName: string) {
  const s = pptx.addSlide();
  s.background = { fill: WHITE };

  // Top accent bar
  s.addShape('rect' as never, {
    x: 0, y: 0, w: '100%', h: 0.08,
    fill: { color: PRIMARY },
  });

  // Left decorative vertical bar
  s.addShape('rect' as never, {
    x: 0, y: 0, w: 0.08, h: '100%',
    fill: { color: TEAL },
  });

  // Title
  s.addText(slide.title, {
    x: 0.8, y: 1.8, w: 8.4, h: 1.6,
    fontSize: 36, fontFace: 'Arial',
    color: PRIMARY, bold: true,
    align: 'center', valign: 'middle',
  });

  // Subtitle
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 1.2, y: 3.5, w: 7.6, h: 0.9,
      fontSize: 18, fontFace: 'Arial',
      color: BODY_TEXT,
      align: 'center', valign: 'middle',
    });
  }

  // Decorative thin line below subtitle
  s.addShape('rect' as never, {
    x: 3.5, y: 4.6, w: 3, h: 0.03,
    fill: { color: TEAL },
  });

  // Course name if different from slide title
  if (courseName && courseName !== slide.title) {
    s.addText(courseName, {
      x: 1.2, y: 4.8, w: 7.6, h: 0.6,
      fontSize: 13, fontFace: 'Arial',
      color: BODY_TEXT, italic: true,
      align: 'center',
    });
  }

  // Bottom accent bar
  s.addShape('rect' as never, {
    x: 0, y: 7.2, w: '100%', h: 0.08,
    fill: { color: TEAL },
  });

  // Brand text
  s.addText('Ecotech', {
    x: 8.0, y: 7.25, w: 1.5, h: 0.35,
    fontSize: 8, fontFace: 'Arial',
    color: BODY_TEXT, align: 'right', italic: true,
  });
}

// ─── Content Slide ───────────────────────────────
function addContentSlide(pptx: PptxGenJS, slide: SlideContent, slideNum: number, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { fill: WHITE };
  addSlideHeader(s, slide.title);

  // Content: join items text or use title as body
  const paragraphs: Array<{ text: string; options?: Record<string, unknown> }> = [];

  if (slide.items && slide.items.length > 0) {
    slide.items.forEach((item) => {
      if (item.heading) {
        paragraphs.push({
          text: item.heading,
          options: { fontSize: 14, bold: true, color: DARK_TEXT, paraSpaceBefore: 12 },
        });
      }
      paragraphs.push({
        text: item.text,
        options: { fontSize: 12, color: BODY_TEXT, paraSpaceBefore: 4, paraSpaceAfter: 4 },
      });
    });
  } else if (slide.subtitle) {
    paragraphs.push({
      text: slide.subtitle,
      options: { fontSize: 13, color: BODY_TEXT },
    });
  }

  if (paragraphs.length > 0) {
    s.addText(paragraphs, {
      x: 0.6, y: 1.3, w: 8.8, h: 5.5,
      fontFace: 'Arial', valign: 'top',
      lineSpacingMultiple: 1.3,
    });
  }

  addFooter(s, slideNum, totalSlides);
}

// ─── List Slide ──────────────────────────────────
function addListSlide(pptx: PptxGenJS, slide: SlideContent, slideNum: number, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { fill: WHITE };
  addSlideHeader(s, slide.title);

  if (slide.items && slide.items.length > 0) {
    // Teal accent bar on left of list area
    s.addShape('rect' as never, {
      x: 0.6, y: 1.3, w: 0.05, h: Math.min(slide.items.length * 0.9, 5.5),
      fill: { color: TEAL },
    });

    const bulletItems: Array<{ text: string; options?: Record<string, unknown> }> = [];

    slide.items.forEach((item, i) => {
      if (item.heading) {
        bulletItems.push({
          text: item.heading,
          options: { fontSize: 14, bold: true, color: DARK_TEXT, paraSpaceBefore: 10, bullet: { type: 'none' as never } },
        });
      }
      bulletItems.push({
        text: item.text,
        options: {
          fontSize: 12, color: BODY_TEXT,
          paraSpaceBefore: 6, paraSpaceAfter: 2,
          bullet: { type: 'bullet' as never, color: TEAL, style: '●' },
        },
      });
    });

    s.addText(bulletItems, {
      x: 0.85, y: 1.3, w: 8.5, h: 5.5,
      fontFace: 'Arial', valign: 'top',
      lineSpacingMultiple: 1.25,
    });
  }

  addFooter(s, slideNum, totalSlides);
}

// ─── Table Slide ─────────────────────────────────
function addTableSlide(pptx: PptxGenJS, slide: SlideContent, slideNum: number, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { fill: WHITE };
  addSlideHeader(s, slide.title);

  if (slide.tableData && slide.tableData.headers.length > 0) {
    const { headers, rows } = slide.tableData;
    const colCount = headers.length;
    const rowCount = rows.length + 1; // +1 for header

    // Table dimensions
    const tableW = 8.8;
    const colW = tableW / colCount;
    const rowH = 0.45;
    const headerH = 0.5;
    const tableX = 0.6;
    const tableY = 1.4;

    const tableRows: Array<Array<{ text: string; options: Record<string, unknown> }>> = [];

    // Header row
    tableRows.push(
      headers.map((h) => ({
        text: h,
        options: {
          fontSize: 11, fontFace: 'Arial', bold: true, color: WHITE, align: 'center', valign: 'middle',
          fill: { color: PRIMARY },
        },
      }))
    );

    // Data rows
    rows.forEach((row, rowIdx) => {
      tableRows.push(
        row.map((cell) => ({
          text: cell,
          options: {
            fontSize: 10, fontFace: 'Arial', color: DARK_TEXT, align: 'center', valign: 'middle',
            fill: { color: rowIdx % 2 === 0 ? LIGHT_BG : WHITE },
          },
        }))
      );
    });

    s.addTable(tableRows, {
      x: tableX, y: tableY, w: tableW,
      colW: Array(colCount).fill(colW),
      rowH: [headerH, ...Array(rows.length).fill(rowH)],
      border: { type: 'solid', pt: 0.5, color: BORDER_LIGHT },
      autoPage: false,
    });
  }

  addFooter(s, slideNum, totalSlides);
}

// ─── Code Slide ──────────────────────────────────
function addCodeSlide(pptx: PptxGenJS, slide: SlideContent, slideNum: number, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { fill: WHITE };
  addSlideHeader(s, slide.title);

  const code = slide.codeBlock?.code || '';
  const language = slide.codeBlock?.language || '';

  if (code) {
    // Language label
    if (language) {
      s.addText(language.toUpperCase(), {
        x: 0.6, y: 1.25, w: 2, h: 0.3,
        fontSize: 8, fontFace: 'Courier New',
        color: TEAL, bold: true,
      });
    }

    // Code background
    const codeStartY = language ? 1.55 : 1.3;
    const codeH = Math.min(5.2, 0.35 + code.split('\n').length * 0.3);

    s.addShape('roundRect' as never, {
      x: 0.6, y: codeStartY, w: 8.8, h: codeH,
      fill: { color: CODE_BG },
      rectRadius: 0.1,
    });

    // Code text
    s.addText(code, {
      x: 0.9, y: codeStartY + 0.15, w: 8.2, h: codeH - 0.3,
      fontSize: 10, fontFace: 'Courier New',
      color: CODE_TEXT, valign: 'top',
      lineSpacingMultiple: 1.35,
    });
  }

  addFooter(s, slideNum, totalSlides);
}

// ─── Quiz Slide ──────────────────────────────────
function addQuizSlide(pptx: PptxGenJS, slide: SlideContent, slideNum: number, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { fill: WHITE };
  addSlideHeader(s, slide.title);

  if (slide.items && slide.items.length > 0) {
    // Display the question as a larger text
    const questionText = slide.items[0]?.text || '';
    s.addText(questionText, {
      x: 0.6, y: 1.3, w: 8.8, h: 1.0,
      fontSize: 15, fontFace: 'Arial',
      color: DARK_TEXT, bold: true,
      valign: 'top',
    });

    // Options A/B/C/D from subsequent items
    const options = slide.items.slice(1);
    const labels = ['A', 'B', 'C', 'D'];
    const optionStartY = 2.6;
    const optionH = 0.75;
    const optionGap = 0.2;

    // Determine which option is the "correct" answer (look for heading that says "Correct")
    let correctIdx = -1;
    options.forEach((opt, idx) => {
      if (opt.heading?.toLowerCase().includes('correct') || opt.heading?.toLowerCase().includes('answer')) {
        correctIdx = idx;
      }
    });

    options.forEach((opt, idx) => {
      if (idx >= 4) return;
      const y = optionStartY + idx * (optionH + optionGap);
      const isCorrect = idx === correctIdx;

      // Option background card
      s.addShape('roundRect' as never, {
        x: 1.0, y, w: 8.0, h: optionH,
        fill: { color: isCorrect ? CORRECT_BG : LIGHT_BG },
        rectRadius: 0.08,
        line: { color: isCorrect ? TEAL : BORDER_LIGHT, width: isCorrect ? 1.5 : 0.5 },
      });

      // Label circle
      s.addShape('ellipse' as never, {
        x: 1.15, y: y + 0.15, w: 0.45, h: 0.45,
        fill: { color: isCorrect ? TEAL : PRIMARY },
      });
      s.addText(labels[idx], {
        x: 1.15, y: y + 0.15, w: 0.45, h: 0.45,
        fontSize: 13, fontFace: 'Arial',
        color: WHITE, bold: true, align: 'center', valign: 'middle',
      });

      // Option text
      s.addText(opt.text, {
        x: 1.85, y, w: 6.9, h: optionH,
        fontSize: 12, fontFace: 'Arial',
        color: isCorrect ? CORRECT_TEXT : BODY_TEXT,
        valign: 'middle', bold: isCorrect,
      });
    });
  }

  addFooter(s, slideNum, totalSlides);
}

// ─── Main POST Handler ───────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GeneratePptxRequest;
    const { slides, courseName } = body;

    if (!slides || !Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json({ error: 'Slides array is required and must not be empty' }, { status: 400 });
    }

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Ecotech LMS';
    pptx.title = courseName || 'Lesson';
    pptx.subject = `Generated by Ecotech LMS: ${courseName || 'Lesson'}`;

    const totalSlides = slides.length;

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      switch (slide.type) {
        case 'title':
          addTitleSlide(pptx, slide, courseName);
          break;
        case 'content':
          addContentSlide(pptx, slide, i + 1, totalSlides);
          break;
        case 'list':
          addListSlide(pptx, slide, i + 1, totalSlides);
          break;
        case 'table':
          addTableSlide(pptx, slide, i + 1, totalSlides);
          break;
        case 'code':
          addCodeSlide(pptx, slide, i + 1, totalSlides);
          break;
        case 'quiz':
          addQuizSlide(pptx, slide, i + 1, totalSlides);
          break;
        default:
          addContentSlide(pptx, slide, i + 1, totalSlides);
          break;
      }
    }

    const safeName = (courseName || 'lesson')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase()
      .slice(0, 60);

    const buffer: Buffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
