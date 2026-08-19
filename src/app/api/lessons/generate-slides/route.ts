import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { streamSlideHtml, parseSSEStream, SLIDE_HTML_SYSTEM_PROMPT } from '@/lib/ai';
import { sanitizeHtml, wrapSlideHtml } from '@/lib/sanitize';

// ============================================
// Style-specific system prompt additions
// ============================================

const STYLE_INSTRUCTIONS: Record<string, string> = {
  professional:
    'Use a clean, corporate color palette (navy, white, gray accents). Structured layouts with clear hierarchy.',
  minimal:
    'Use ample whitespace, simple sans-serif typography, monochrome palette with one accent color.',
  creative:
    'Use bold, vibrant colors, dynamic asymmetric layouts, creative typography.',
  academic:
    'Use formal academic styling, serif headings, structured content blocks, citation-friendly layout.',
  tech: 'Use a dark theme (dark slate/gray backgrounds), neon accent colors (cyan, green), monospace fonts for code.',
};

/** Per-slide generation timeout in milliseconds */
const SLIDE_TIMEOUT_MS = 120_000; // 2 minutes per slide

// ============================================
// Types
// ============================================

interface GenerateSlidesRequest {
  lessonId: string;
  language?: string;
}

interface OutlineSlide {
  slideNumber?: number;
  title: string;
  outline: string;
}

interface OutlineJson {
  topic: string;
  style: string;
  slideCount?: number;
  language?: string;
  slides: OutlineSlide[];
  referenceContext?: string;
  referenceSources?: { file: string; charCount: number }[];
}

// ============================================
// Helper: build per-slide system prompt
// ============================================

function buildSystemPrompt(style: string): string {
  const styleInstruction = STYLE_INSTRUCTIONS[style] || '';
  return `${SLIDE_HTML_SYSTEM_PROMPT}

${styleInstruction ? `STYLE DIRECTION: ${styleInstruction}` : ''}`;
}

// ============================================
// Helper: build per-slide user prompt with full lesson context
// ============================================

function buildUserPrompt(
  topic: string,
  slideTitle: string,
  slideOutline: string,
  slideIndex: number,
  totalSlides: number,
  isChinese: boolean,
  allSlides: OutlineSlide[],
  referenceContext?: string,
): string {
  const langInstruction = isChinese
    ? '\u8bf7\u4f7f\u7528\u4e2d\u6587\u751f\u6210\u6240\u6709\u5e7b\u706f\u7247\u5185\u5bb9\u3002'
    : 'Generate all slide content in English.';

  const lessonOverview = allSlides
    .map((s, i) => `  ${i + 1}. ${s.title}`)
    .join('\n');

  const isFirst = slideIndex === 0;
  const isSecond = slideIndex === 1;
  const isLast = slideIndex === totalSlides - 1;
  const isSecondLast = slideIndex === totalSlides - 2;
  let positionHint = '';
  if (isFirst) {
    positionHint = isChinese
      ? '\u2b50 \u8fd9\u662f\u7b2c\u4e00\u5f20\u5e7b\u706f\u7247\u2014\u2014\u5e94\u8be5\u4ecb\u7ecd\u4e3b\u9898\uff0c\u8bbe\u5b9a\u5b66\u4e60\u76ee\u6807\u548c\u80cc\u666f\u3002\u4e0d\u8981\u6df1\u5165\u7ec6\u8282\u3002\u5e03\u5c40\u5e94\u8be5\u6709\u660e\u786e\u7684\u6807\u9898\u548c\u8f68\u8ff9\u3002'
      : '\u2b50 This is the FIRST slide \u2014 introduce the topic, set learning objectives, and provide context. Do NOT go into details. Layout should have a clear title and a brief overview of what will be covered.';
  } else if (isSecond && totalSlides > 3) {
    positionHint = isChinese
      ? '\ud83d\udcda \u8fd9\u662f\u7b2c\u4e8c\u5f20\u5e7b\u706f\u7247\u2014\u2014\u5e94\u8be5\u5b9a\u4e49\u6838\u5fc3\u6982\u5ff5\u548c\u672f\u8bed\u3002\u4f7f\u7528\u6e05\u6670\u7684\u5b9a\u4e49\u683c\u5f0f\u3002'
      : '\ud83d\udcda This is the SECOND slide \u2014 define core concepts and key terminology. Use clear definition-style formatting (term + explanation).';
  } else if (slideIndex === 2 && totalSlides > 5) {
    positionHint = isChinese
      ? '\ud83d\udca1 \u8fd9\u662f\u7b2c\u4e09\u5f20\u5e7b\u706f\u7247\u2014\u2014\u9002\u5408\u6df1\u5165\u8be6\u7ec6\u89e3\u91ca\uff0c\u5e26\u5177\u4f53\u793a\u4f8b\u3002'
      : '\ud83d\udca1 This is the THIRD slide \u2014 suitable for a detailed explanation with a concrete example or illustration.';
  } else if (isSecondLast && totalSlides > 3) {
    positionHint = isChinese
      ? '\ud83d\udcdd \u8fd9\u662f\u5012\u6570\u7b2c\u4e8c\u5f20\u5e7b\u706f\u7247\u2014\u2014\u9002\u5408\u5e94\u7528\u7ec3\u4e60\u3001\u6848\u4f8b\u7814\u7a76\u6216\u8ba8\u8bba\u9898\u3002'
      : '\ud83d\udcdd This is the second-to-last slide \u2014 ideal for an application exercise, case study, discussion question, or practice problem.';
  } else if (isLast) {
    positionHint = isChinese
      ? '\u2705 \u8fd9\u662f\u6700\u540e\u4e00\u5f20\u5e7b\u706f\u7247\u2014\u2014\u603b\u7ed3\u5173\u952e\u8981\u70b9\u548c\u5b66\u4e60\u6210\u679c\u3002\u5217\u51fa\u5173\u952e\u6536\u83b7\uff0c\u63d0\u4f9b\u7ed3\u675f\u611f\u3002'
      : '\u2705 This is the LAST slide \u2014 summarize key takeaways and learning outcomes. List the key points covered and provide a sense of closure.';
  }

  const prevSlideTitle = slideIndex > 0 ? allSlides[slideIndex - 1]?.title : '';
  const nextSlideTitle = slideIndex < allSlides.length - 1 ? allSlides[slideIndex + 1]?.title : '';
  const antiRepeatHint = (prevSlideTitle || nextSlideTitle)
    ? isChinese
      ? `\n\u907f\u514d\u91cd\u590d\u63d0\u793a\uff1a\u524d\u4e00\u5f20\u5e7b\u706f\u7247\u662f\u201c${prevSlideTitle}\u201d\uff0c\u540e\u4e00\u5f20\u662f\u201c${nextSlideTitle}\u201d\u2014\u2014\u786e\u4fdd\u8fd9\u5f20\u5e7b\u706f\u7247\u7684\u5185\u5bb9\u548c\u5e03\u5c40\u4e0e\u5b83\u4eec\u660e\u663e\u4e0d\u540c\u3002`
      : `\nAnti-repetition hint: The previous slide is \u201c${prevSlideTitle}\u201d and the next is \u201c${nextSlideTitle}\u201d \u2014 ensure this slide\u2019s content and layout differ markedly from both.`
    : '';

  const referenceSection = referenceContext
    ? `\n\n${isChinese ? '\u53c2\u8003\u8d44\u6599\uff08\u751f\u6210\u5185\u5bb9\u5fc5\u987b\u57fa\u4e8e\u6b64\u6750\u6599\uff0c\u4fdd\u7559\u672f\u8bed\u548c\u6982\u5ff5\uff09:' : 'REFERENCE MATERIAL (generated content MUST be grounded in this source, preserving terminology and concepts):'}\n<reference>${referenceContext}</reference>`
    : '';

  return `${isChinese ? '\u8bfe\u7a0b\u4e3b\u9898' : 'Lesson topic'}: ${topic}

${isChinese ? '\u5b8c\u6574\u8bfe\u7a0b\u5927\u7eb2\uff08\u6240\u6709\u5e7b\u706f\u7247\uff09:' : 'Full lesson outline (all slides):'}
${lessonOverview}

${isChinese ? '\u5f53\u524d\u5e7b\u706f\u7247' : 'Current slide'}: ${slideTitle} (${isChinese ? '\u7b2c' : 'slide '}${slideIndex + 1} ${isChinese ? '\u5f20\uff0c\u5171' : 'of '}${totalSlides})

${slideOutline ? `${isChinese ? '\u5185\u5bb9\u5927\u7eb2' : 'Content outline'}: ${slideOutline}` : ''}

${positionHint}${antiRepeatHint}
${isChinese
    ? '\u6559\u80b2\u8d28\u91cf\u8981\u6c42\uff1a\n- \u6bcf\u5f20\u5e7b\u706f\u7247\u5fc5\u987b\u6709\u660e\u786e\u7684\u6559\u5b66\u76ee\u7684\u2014\u2014\u5b66\u751f\u5e94\u8be5\u4ece\u8fd9\u5f20\u5e7b\u706f\u7247\u5b66\u5230\u4ec0\u4e48\uff1f\n- \u5e03\u5c40\u548c\u7ed3\u6784\u5e94\u6839\u636e\u5185\u5bb9\u7c7b\u578b\u800c\u53d8\u5316\u2014\u2014\u4e0d\u8981\u6bcf\u5f20\u90fd\u4f7f\u7528\u76f8\u540c\u7684\u5e03\u5c40\u3002\n- \u5185\u5bb9\u5e94\u8be5\u7b80\u6d01\u4f46\u4fe1\u606f\u4e30\u5bcc\u2014\u2014\u8fd9\u662f\u6559\u5b66\u5e7b\u706f\u7247\uff0c\u4e0d\u662f\u6587\u6863\u3002\n- \u907f\u514d\u6cdb\u6cdb\u7684\u586b\u5145\u5185\u5bb9\u2014\u2014\u6bcf\u53e5\u8bdd\u90fd\u5e94\u8be5\u6709\u6559\u80b2\u4ef7\u503c\u3002\n- \u4f7f\u7528\u5217\u8868\u3001\u8868\u683c\u3001\u5f3a\u8c03\u6846\u7b49\u89c6\u89c9\u7ed3\u6784\u6765\u7ec4\u7ec7\u4fe1\u606f\u3002\n- \u6bcf\u4e2a\u6982\u5ff5\u7528\u7b80\u77ed\u6e05\u6670\u7684\u8bed\u8a00\u89e3\u91ca\u2014\u2014\u907f\u514d\u5197\u957f\u7684\u6bb5\u843d\u3002'
    : `EDUCATIONAL QUALITY REQUIREMENTS:\n- Each slide MUST have a clear teaching purpose \u2014 what should a student learn from this slide?\n- Vary layout and structure based on content type \u2014 do NOT use the same layout for every slide.\n- Content should be concise but information-rich \u2014 these are teaching slides, not documents.\n- Avoid generic filler content \u2014 every sentence must have educational value.\n- Use lists, tables, callout boxes, and visual structure to organize information.\n- Explain each concept in short, clear language \u2014 avoid long paragraphs.\n- Use visual elements (CSS decorations, icons, color highlights) to enhance understanding, not just for decoration.`
  }\n\n${langInstruction}${referenceSection}`;
}

// ============================================
// Helper: per-slide timeout wrapper
// ============================================

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

// ============================================
// Core: generate all slides for a lesson (no SSE)
// Runs in the background, updates DB as slides complete
// ============================================

async function generateAllSlides(lessonId: string, language?: string): Promise<void> {
  // ---- Fetch lesson with slides and course ----
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      course: { select: { id: true, language: true } },
      slides: { where: { status: 'DRAFT_OUTLINE' }, orderBy: { order: 'asc' } },
    },
  });

  if (!lesson || lesson.slides.length === 0) {
    console.error(`[generate-slides] Lesson ${lessonId} not found or no slides`);
    return;
  }

  const slides = lesson.slides;
  const totalSlides = slides.length;
  console.log(`[generate-slides] Starting async generation for lesson ${lessonId}: ${totalSlides} slides`);

  const effectiveLanguage = language || lesson.course?.language || 'english';
  const isChinese = effectiveLanguage === 'chinese';

  let outlineJson: OutlineJson;
  try {
    outlineJson = lesson.outlineJson
      ? (JSON.parse(lesson.outlineJson) as OutlineJson)
      : { topic: lesson.title, style: 'professional', slides: [] };
  } catch {
    outlineJson = { topic: lesson.title, style: 'professional', slides: [] };
  }

  const style = outlineJson.style || 'professional';
  const topic = outlineJson.topic || lesson.title;
  const allSlides = outlineJson.slides || [];
  const referenceContext = outlineJson.referenceContext;
  const systemPrompt = buildSystemPrompt(style);

  // ---- Process each slide ----
  for (let i = 0; i < totalSlides; i++) {
    const slide = slides[i];
    console.log(`[generate-slides] Slide ${i + 1}/${totalSlides}: "${slide.title}" (id: ${slide.id})`);

    const outlineEntry = outlineJson.slides?.find((s) => s.title === slide.title);
    const slideOutline = outlineEntry?.outline || '';

    // Update slide status to GENERATING
    try {
      await db.slide.update({ where: { id: slide.id }, data: { status: 'GENERATING' } });
    } catch (dbErr) {
      console.error(`[generate-slides] DB status update error for slide ${slide.id}:`, dbErr);
    }

    const userPrompt = buildUserPrompt(topic, slide.title, slideOutline, i, totalSlides, isChinese, allSlides, referenceContext);

    try {
      console.log(`[generate-slides] Calling streamSlideHtml for slide ${i + 1}...`);
      const rawSSEStream = await withTimeout(
        streamSlideHtml(userPrompt, systemPrompt),
        SLIDE_TIMEOUT_MS,
        `streamSlideHtml slide ${i + 1}`,
      );

      const textStream = parseSSEStream(rawSSEStream);
      const reader = textStream.getReader();
      let fullHtml = '';

      while (true) {
        const { done, value } = await withTimeout(
          reader.read(),
          SLIDE_TIMEOUT_MS,
          `read chunk for slide ${i + 1}`,
        );
        if (done) break;
        fullHtml += value;
      }

      console.log(`[generate-slides] Slide ${i + 1} stream done: ${fullHtml.length} chars`);

      const sanitized = sanitizeHtml(fullHtml);
      const wrapped = wrapSlideHtml(sanitized, { title: slide.title });

      await db.slide.update({
        where: { id: slide.id },
        data: { htmlBody: wrapped, status: 'READY' },
      });

      console.log(`[generate-slides] Slide ${i + 1} COMPLETE`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate slide HTML';
      console.error(`[generate-slides] Slide ${i + 1} ERROR: ${message}`);
      try {
        await db.slide.update({ where: { id: slide.id }, data: { status: 'ERROR' } });
      } catch {
        // Ignore
      }
    }
  }

  console.log(`[generate-slides] All done for lesson ${lessonId}`);
}

// ============================================
// POST /api/lessons/generate-slides
// Starts async generation, returns immediately
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateSlidesRequest;
    const { lessonId, language } = body;

    if (!lessonId) {
      return NextResponse.json({ success: false, error: 'lessonId is required' }, { status: 400 });
    }

    // Verify lesson exists and has DRAFT_OUTLINE slides
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        slides: { where: { status: 'DRAFT_OUTLINE' }, orderBy: { order: 'asc' } },
      },
    });

    if (!lesson) {
      return NextResponse.json({ success: false, error: 'Lesson not found' }, { status: 404 });
    }

    if (lesson.slides.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No slides with DRAFT_OUTLINE status found' },
        { status: 400 },
      );
    }

    const totalSlides = lesson.slides.length;

    // Start generation in background (fire-and-forget)
    // We don't await — the caller gets an immediate response
    generateAllSlides(lessonId, language).catch((err) => {
      console.error(`[generate-slides] Background generation failed:`, err);
    });

    return NextResponse.json({
      success: true,
      data: { lessonId, totalSlides, status: 'generating' },
    });
  } catch (error) {
    console.error('[generate-slides] POST error:', error);
    const message = error instanceof Error ? error.message : 'Failed to start slide generation';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
