import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateStructuredJSON } from "@/lib/llm";
import { z } from "zod/v4";
import {
  SLIDE_STYLES,
  VALID_STYLES,
  MIN_SLIDES,
  MAX_SLIDES,
} from "@/lib/slide-styles";
import { extractTextFromFiles, truncateTextForContext } from "@/lib/extract-doc";
import path from "path";

// ============================================
// Zod schema for LLM response
// ============================================

const SlideOutlineSchema = z.object({
  slideNumber: z.number(),
  title: z.string(),
  outline: z.string(),
});

const OutlineResponseSchema = z.object({
  lessonTitle: z.string(),
  slides: z.array(SlideOutlineSchema),
});

type OutlineResponse = z.infer<typeof OutlineResponseSchema>;

// ============================================
// POST /api/lessons/generate-outline
// ============================================

interface GenerateOutlineRequest {
  courseId: string;
  topic: string;
  slideCount: number;
  style: string;
  language?: string;
  existingLessonId?: string;
  referenceFileUrls?: string[];
}

/** Max chars of reference text to include in prompt (~3000 tokens) */
const MAX_REFERENCE_CHARS = 12000;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateOutlineRequest;
    const {
      courseId,
      topic,
      slideCount,
      style,
      language = "english",
      existingLessonId,
      referenceFileUrls,
    } = body;

    // ---- Validate inputs ----
    if (!courseId || !topic || !slideCount || !style) {
      return NextResponse.json(
        { success: false, error: "courseId, topic, slideCount, and style are required" },
        { status: 400 },
      );
    }

    if (!VALID_STYLES.includes(style)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid style. Must be one of: ${VALID_STYLES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const clampedCount = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Math.round(slideCount)));
    const isChinese = language === "chinese";

    // ---- Verify course exists ----
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json(
        { success: false, error: "Course not found" },
        { status: 404 },
      );
    }

    // ---- Extract reference document content ----
    let referenceContext = "";
    let extractedSources: { file: string; charCount: number }[] = [];

    if (referenceFileUrls && referenceFileUrls.length > 0) {
      try {
        const filePaths = referenceFileUrls
          .map((url) => {
            const cleanUrl = url.replace(/^\//, "");
            return path.join(process.cwd(), "public", cleanUrl);
          })
          .filter((fp) => {
            const normalized = path.normalize(fp);
            return normalized.startsWith(path.join(process.cwd(), "public"));
          });

        if (filePaths.length > 0) {
          const result = await extractTextFromFiles(filePaths);
          extractedSources = result.sources;
          if (result.text) {
            referenceContext = truncateTextForContext(result.text, MAX_REFERENCE_CHARS, topic);
          }
        }
      } catch (error) {
        console.error("Error extracting reference documents:", error);
      }
    }

    // ---- Build the LLM prompt ----
    const styleInfo = SLIDE_STYLES.find((s) => s.value === style);
    const styleDescription = styleInfo
      ? `${styleInfo.label} (${styleInfo.description})`
      : style;

    const referenceSection = referenceContext
      ? `
${isChinese ? "参考材料（大纲内容必须基于此材料，保留关键术语和事实）:" : "REFERENCE MATERIAL (outline MUST be based on this content — preserve key terms, facts, and data):"}

<reference_documents>
${referenceContext}
</reference_documents>
`
      : "";

    const prompt = `${isChinese ? "演示主题" : "Presentation topic"}: ${topic}
${isChinese ? "幻灯片数量" : "Number of slides"}: ${clampedCount}
${isChinese ? "设计风格" : "Design style"}: ${styleDescription}
${referenceSection}
${isChinese
      ? `请为以上主题生成一个演示文稿（PPT）大纲。这就像你是一个需要做课堂展示的学生，或者需要做产品推介的职场人士，正在准备你的幻灯片大纲。

要求：
1. ${referenceContext ? "大纲必须基于参考材料中的实际内容，保留重要术语和数据。" : ""}
2. 第一张幻灯片 = 标题页（主标题 + 副标题/标语）
3. 最后一张幻灯片 = 结束页（如"谢谢"、"Q&A"、联系方式等）
4. 中间的幻灯片 = 内容页，每张包含一个清晰的标题和3-5个要点
5. 每张幻灯片的outline描述应该说明：这张幻灯片展示什么关键信息，用什么方式展示（比如"左侧标题，右侧三个卡片"或"顶部标题，下方四宫格"）
6. 不要写"学习目标"、"你将学到什么"、"课程概述"这类教育性内容
7. 每张幻灯片应该像真正的PPT一样——简洁、有冲击力、视觉化
8. 用中文生成所有内容。`
      : `Generate a presentation (PPT) outline for the given topic. Think of it like you're a student preparing slides for a class presentation, or a professional creating a pitch deck.

Requirements:
1. ${referenceContext ? "The outline MUST be grounded in the reference material above. Preserve key terms, facts, data, and specifics from the source. Do NOT fabricate information." : ""}
2. First slide = Title slide (main title + subtitle/tagline)
3. Last slide = Closing slide (e.g. "Thank You", "Questions?", contact info)
4. Middle slides = Content slides, each with a clear title and 3-5 key talking points
5. Each slide's outline should describe: what key info this slide shows, and HOW to present it visually (e.g. "left-aligned title with 3 cards on the right" or "top banner with a 2-column comparison below")
6. Do NOT create "Learning Objectives", "What You'll Learn", "Course Overview", or any educational/lesson-style content
7. Each slide should feel like a REAL presentation slide — concise, impactful, visual
8. Generate all content in English.`
    }`;

    // ---- Call LLM ----
    console.log(`[generate-outline] Calling LLM for topic: "${topic}", ${clampedCount} slides, ${style}`);
    let result: OutlineResponse;
    try {
      result = await generateStructuredJSON(prompt, OutlineResponseSchema);
      console.log(`[generate-outline] LLM returned ${result.slides.length} slides, title: "${result.lessonTitle}"`);
    } catch (llmError) {
      console.error("[generate-outline] LLM call failed:", llmError);
      const msg = llmError instanceof Error ? llmError.message : "AI service unavailable. Please try again.";
      return NextResponse.json({ success: false, error: msg }, { status: 502 });
    }

    // ---- Determine lesson count for ordering ----
    const existingLessonCount = await db.lesson.count({ where: { courseId } });

    // Build outlineJson with reference source info for slide generation
    const outlineData = {
      topic,
      style,
      slideCount: clampedCount,
      language,
      slides: result.slides,
      referenceContext: referenceContext || undefined,
      referenceSources: extractedSources.length > 0 ? extractedSources : undefined,
    };

    // ---- Create Lesson + Slide records ----
    let lesson;

    if (existingLessonId) {
      await db.slide.deleteMany({ where: { lessonId: existingLessonId } });
      lesson = await db.lesson.update({
        where: { id: existingLessonId },
        data: {
          title: result.lessonTitle,
          outlineJson: JSON.stringify(outlineData),
        },
      });
    } else {
      lesson = await db.lesson.create({
        data: {
          courseId,
          title: result.lessonTitle,
          order: existingLessonCount,
          outlineJson: JSON.stringify(outlineData),
        },
      });
    }

    await db.slide.createMany({
      data: result.slides.map((s, i) => ({
        title: s.title,
        htmlBody: "",
        status: "DRAFT_OUTLINE",
        order: i,
        lessonId: lesson.id,
      })),
    });

    const createdSlides = await db.slide.findMany({
      where: { lessonId: lesson.id },
      orderBy: { order: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: lesson.id,
        title: lesson.title,
        order: lesson.order,
        courseId: lesson.courseId,
        outlineJson: lesson.outlineJson,
        slides: createdSlides.map((s) => ({
          id: s.id,
          title: s.title,
          htmlBody: s.htmlBody,
          status: s.status,
          order: s.order,
          lessonId: s.lessonId,
        })),
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      },
    });
  } catch (error) {
    console.error("[generate-outline] Unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate outline. Please try again.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
