import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { streamSlideHtml, parseSSEStream, SLIDE_HTML_SYSTEM_PROMPT } from '@/lib/ai';
import { sanitizeHtml, wrapSlideHtml } from '@/lib/sanitize';
import { SLIDE_STYLES, type SlideStyle } from '@/lib/slide-styles';

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
    ? '请使用中文生成所有幻灯片内容。'
    : 'Generate all slide content in English.';

  // Build lesson-level context: show all slide titles so the AI understands the full lesson
  const lessonOverview = allSlides
    .map((s, i) => `  ${i + 1}. ${s.title}`)
    .join('\n');

  // Determine position-based guidance
  const isFirst = slideIndex === 0;
  const isLast = slideIndex === totalSlides - 1;
  let positionHint = '';
  if (isFirst) {
    positionHint = isChinese
      ? '这是第一张幻灯片——应该介绍主题并设定背景。不要深入细节。'
      : 'This is the FIRST slide — introduce the topic and set context. Do NOT go into details yet.';
  } else if (isLast) {
    positionHint = isChinese
      ? '这是最后一张幻灯片——应该总结关键要点并提供结束感。'
      : 'This is the LAST slide — summarize key takeaways and provide closure.';
  }

  // Build reference context section
  const referenceSection = referenceContext
    ? `\n\n${isChinese ? '参考资料（生成内容必须基于此材料）:' : 'REFERENCE MATERIAL (generated content MUST be grounded in this source):'}\n<reference>${referenceContext}</reference>`
    : '';

  return `${isChinese ? '课程主题' : 'Lesson topic'}: ${topic}

${isChinese ? '完整课程大纲（所有幻灯片）:' : 'Full lesson outline (all slides):'}
${lessonOverview}

${isChinese ? '当前幻灯片' : 'Current slide'}: ${slideTitle} (${isChinese ? '第' : 'slide '}${slideIndex + 1} ${isChinese ? '张，共' : 'of '}${totalSlides})

${slideOutline ? `${isChinese ? '内容大纲' : 'Content outline'}: ${slideOutline}` : ''}

${positionHint}\n
${isChinese
    ? '重要要求：\n- 每张幻灯片的布局和结构应该根据内容类型而变化——不要每张都使用相同的布局。\n- 避免与其他幻灯片重复相同的内容或结构。\n- 使用相关的ImageKit AI生成图片来增强视觉传达。\n- 内容应该简洁但信息丰富——这是教学幻灯片，不是文档。'
    : `IMPORTANT REQUIREMENTS:\n- Vary the layout and structure for each slide based on its content type — do NOT use the same layout for every slide.\n- Do NOT repeat the same content or structure as other slides in this lesson.\n- Use relevant ImageKit AI-generated images to enhance visual communication.\n- Content should be concise but information-rich — these are teaching slides, not documents.`
  }\n
${langInstruction}${referenceSection}`;
}

// ============================================
// POST /api/lessons/generate-slides
// ============================================

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let body: GenerateSlidesRequest;

      // ---- Parse request body ----
      try {
        body = (await request.json()) as GenerateSlidesRequest;
      } catch {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: 'Invalid request body' })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      const { lessonId, language } = body;

      if (!lessonId) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: 'lessonId is required' })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      // ---- Fetch lesson with slides and course ----
      let lesson;
      try {
        lesson = await db.lesson.findUnique({
          where: { id: lessonId },
          include: {
            course: { select: { id: true, language: true } },
            slides: {
              where: { status: 'DRAFT_OUTLINE' },
              orderBy: { order: 'asc' },
            },
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Database error fetching lesson';
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      if (!lesson) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: 'Lesson not found' })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      const slides = lesson.slides;
      const totalSlides = slides.length;

      if (totalSlides === 0) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ error: 'No slides with DRAFT_OUTLINE status found' })}\n\n`,
          ),
        );
        controller.close();
        return;
      }

      // ---- Determine language and style ----
      const effectiveLanguage = language || lesson.course?.language || 'english';
      const isChinese = effectiveLanguage === 'chinese';

      // ---- Parse outlineJson ----
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
      let slidesGenerated = 0;

      for (let i = 0; i < totalSlides; i++) {
        const slide = slides[i];

        // Find matching outline entry by title
        const outlineEntry = outlineJson.slides?.find(
          (s) => s.title === slide.title,
        );
        const slideOutline = outlineEntry?.outline || '';

        // Update slide status to GENERATING
        try {
          await db.slide.update({
            where: { id: slide.id },
            data: { status: 'GENERATING' },
          });
        } catch {
          // Continue even if status update fails
        }

        // Emit slide_start
        controller.enqueue(
          encoder.encode(
            `event: slide_start\ndata: ${JSON.stringify({
              slideId: slide.id,
              slideTitle: slide.title,
              slideIndex: i,
              totalSlides,
            })}\n\n`,
          ),
        );

        // Build user prompt for this slide — with full lesson context
        const userPrompt = buildUserPrompt(
          topic,
          slide.title,
          slideOutline,
          i,
          totalSlides,
          isChinese,
          allSlides,
          referenceContext,
        );

        // Stream HTML from AI
        try {
          const rawSSEStream = await streamSlideHtml(userPrompt, systemPrompt);
          const textStream = parseSSEStream(rawSSEStream);
          const reader = textStream.getReader();
          let fullHtml = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            fullHtml += value;

            // Emit chunk for this slide
            controller.enqueue(
              encoder.encode(
                `event: chunk\ndata: ${JSON.stringify({
                  slideId: slide.id,
                  html: value,
                })}\n\n`,
              ),
            );
          }

          // Sanitize and wrap the complete HTML
          const sanitized = sanitizeHtml(fullHtml);
          const wrapped = wrapSlideHtml(sanitized, { title: slide.title });

          // Save to DB and update status
          await db.slide.update({
            where: { id: slide.id },
            data: { htmlBody: wrapped, status: 'READY' },
          });

          slidesGenerated++;

          // Emit slide_complete
          controller.enqueue(
            encoder.encode(
              `event: slide_complete\ndata: ${JSON.stringify({
                slideId: slide.id,
                slideTitle: slide.title,
                htmlBody: wrapped,
              })}\n\n`,
            ),
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to generate slide HTML';

          // Update slide status to ERROR
          try {
            await db.slide.update({
              where: { id: slide.id },
              data: { status: 'ERROR' },
            });
          } catch {
            // Ignore
          }

          // Emit slide_error but continue to next slide
          controller.enqueue(
            encoder.encode(
              `event: slide_error\ndata: ${JSON.stringify({
                slideId: slide.id,
                error: message,
              })}\n\n`,
            ),
          );
        }
      }

      // ---- All slides done ----
      controller.enqueue(
        encoder.encode(
          `event: all_complete\ndata: ${JSON.stringify({
            lessonId,
            slidesGenerated,
          })}\n\n`,
        ),
      );

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
