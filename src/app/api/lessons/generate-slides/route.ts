import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { streamSlideHtml, parseSSEStream, SLIDE_HTML_SYSTEM_PROMPT } from '@/lib/ai';
import { sanitizeHtml, wrapSlideHtml } from '@/lib/sanitize';

// ============================================
// Style-specific system prompt additions
// ============================================

const STYLE_INSTRUCTIONS: Record<string, string> = {
  professional:
    'Use a clean corporate palette (navy, white, gray). Strong title hierarchy. Use accent bars and subtle borders for structure.',
  minimal:
    'Use ample whitespace, one accent color, clean sans-serif. Let the content breathe. Very few elements per slide.',
  creative:
    'Use bold vibrant colors, asymmetric layouts, large typography. Be visually daring with gradients and color blocks.',
  academic:
    'Use a formal, structured layout. Clean headers, organized content blocks. Professional and serious tone.',
  tech:
    'Use dark backgrounds (dark slate/gray), neon accents (cyan, green, purple). Monospace fonts for technical terms. Futuristic feel.',
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
// Helper: build per-slide user prompt
// PPT-style: focuses on visual presentation, NOT education
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
  const isFirst = slideIndex === 0;
  const isLast = slideIndex === totalSlides - 1;
  const isSecond = slideIndex === 1;

  let layoutGuidance = '';

  if (isFirst) {
    layoutGuidance = isChinese
      ? `
📌 这是第一张幻灯片 = 标题页。
设计要求：
- 大标题居中显示，醒目有力
- 副标题/标语在标题下方，字体较小
- 可以加装饰性色块或线条
- 不要放任何要点列表
- 保持简洁大气`
      : `
📌 This is the FIRST slide = TITLE SLIDE.
Design requirements:
- Large, bold title centered on the slide
- Subtitle/tagline below in smaller text
- Add a decorative accent bar, gradient block, or visual element
- Do NOT include any bullet points, lists, or content items
- Keep it clean and impactful like a real presentation cover`;
  } else if (isLast) {
    layoutGuidance = isChinese
      ? `
📌 这是最后一张幻灯片 = 结束页。
设计要求：
- 大字显示"谢谢"或"Q&A"或"有任何问题吗？"
- 可以加上主题相关的结束语
- 保持简洁优雅`
      : `
📌 This is the LAST slide = CLOSING SLIDE.
Design requirements:
- Large text: "Thank You" or "Questions?" or "Any Questions?"
- Optional: add a brief closing statement related to the topic
- Keep it clean and elegant`;
  } else if (isSecond && totalSlides > 3) {
    layoutGuidance = isChinese
      ? `
📌 这是第二张幻灯片 = 概述/背景页。
设计要求：
- 标题在顶部
- 3-5个关键点，每点一行简短文字
- 可以用带图标的卡片或色块来展示每个要点
- 不要写"学习目标"，直接展示关键信息`
      : `
📌 This is the SECOND slide = OVERVIEW/CONTEXT slide.
Design requirements:
- Title at the top
- 3-5 key points, each as a short one-line bullet
- Use icon cards or colored blocks for each point
- Do NOT write "Learning Objectives" — just present the key information directly`;
  }

  const prevTitle = slideIndex > 0 ? allSlides[slideIndex - 1]?.title : '';
  const nextTitle = slideIndex < allSlides.length - 1 ? allSlides[slideIndex + 1]?.title : '';
  const antiRepeat = (prevTitle || nextTitle)
    ? isChinese
      ? `
⚠️ 避免重复：前一张是"${prevTitle}"，后一张是"${nextTitle}" — 这张的布局和内容必须与它们明显不同。`
      : `
⚠️ Anti-repeat: Previous slide is "${prevTitle}", next is "${nextTitle}" — this slide's layout and content MUST differ markedly from both.`
    : '';

  const referenceSection = referenceContext
    ? `

${isChinese ? '参考资料（内容必须基于此材料）:' : 'REFERENCE MATERIAL (content MUST be based on this source):'}
<reference>${referenceContext}</reference>`
    : '';

  return `${isChinese ? '演示主题' : 'Presentation topic'}: ${topic}

${isChinese ? '当前幻灯片' : 'Current slide'}: "${slideTitle}" (${isChinese ? '第' : 'slide '}${slideIndex + 1} ${isChinese ? '张，共' : 'of '}${totalSlides})

${slideOutline ? `${isChinese ? '内容要点' : 'Key points to cover'}: ${slideOutline}` : ''}
${layoutGuidance}
${antiRepeat}

${isChinese
    ? `设计提醒：
- 这是PPT演示文稿的幻灯片，不是课程页面
- 文字要简短有力，每个要点最多一行
- 不要写长段落
- 不要写“你将学到什么”或“学习目标”
- 使用视觉化布局：卡片、色块、图标、数字标记等
- 让它看起来像真正的PowerPoint幻灯片`
    : `DESIGN REMINDERS:
- This is a PRESENTATION SLIDE, not a lesson page
- Keep text SHORT and punchy — each point should be one line max
- Do NOT write long paragraphs
- Do NOT write "What You'll Learn" or "Learning Objectives"
- Use visual layouts: cards, color blocks, icons, number badges, accent bars
- Make it look like a REAL PowerPoint/Keynote slide`}
${referenceSection}`;
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
// Core: generate all slides for a lesson
// Runs in the background, updates DB as slides complete
// ============================================

async function generateAllSlides(lessonId: string, language?: string): Promise<void> {
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
