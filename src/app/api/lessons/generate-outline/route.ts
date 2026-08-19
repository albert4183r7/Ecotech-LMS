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
        // Convert URLs to file paths (they are relative to public/)
        const filePaths = referenceFileUrls
          .map((url) => {
            // URL is like /uploads/docs/uuid.pdf
            const cleanUrl = url.replace(/^\//, "");
            return path.join(process.cwd(), "public", cleanUrl);
          })
          .filter((fp) => {
            // Basic path traversal prevention
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
        // Don't fail the whole request — continue without reference context
      }
    }

    // ---- Build the LLM prompt ----
    const styleInfo = SLIDE_STYLES.find((s) => s.value === style);
    const styleDescription = styleInfo
      ? `${styleInfo.label} (${styleInfo.description})`
      : style;

    // Build reference material section
    const referenceSection = referenceContext
      ? `
${isChinese ? "参考材料（必须基于此内容生成大纲，保留关键术语和概念）:" : "REFERENCE MATERIAL (you MUST base the outline on this content — preserve key terminology, concepts, and facts):"}

<reference_documents>
${referenceContext}
</reference_documents>
`
      : "";

    const prompt = `${isChinese ? "课程主题" : "Topic"}: ${topic}
${isChinese ? "幻灯片数量" : "Number of slides"}: ${clampedCount}
${isChinese ? "设计风格" : "Design style"}: ${styleDescription}
${referenceSection}
${isChinese
      ? `请为以上主题生成一个教育性课程大纲。要求：
1. ${referenceContext ? "大纲必须基于参考材料中的实际内容，保留重要术语和概念。不要编造参考材料中没有的内容。" : ""}
2. 幻灯片应该有教育性的递进结构，例如：
   - 引入/背景
   - 核心概念定义
   - 详细解释或示例
   - 比较/对比或过程说明
   - 应用/实践
   - 总结/要点回顾
3. 每张幻灯片有不同的教学目的——避免重复结构。
4. 每个幻灯片应包含一个标题和详细的内容大纲描述（2-4句话，说明应该展示什么内容、如何展示）。
5. 不要使用通用的填充内容。每个幻灯片都应该有独特的教育价值。
6. 用中文生成所有内容。`
      : `Generate an educational lesson slide outline for the given topic. Requirements:
1. ${referenceContext ? "The outline MUST be grounded in the reference material above. Preserve key terminology, definitions, concepts, and facts from the source. Do NOT fabricate information not present in the reference material." : ""}
2. The slides should follow an educational progression, such as:
   - Introduction / context
   - Core concept definitions
   - Detailed explanation with examples
   - Comparison, process, or visual explanation
   - Application or practice
   - Summary / key takeaways
3. Each slide must serve a DIFFERENT instructional purpose — avoid repetitive structures.
4. Each slide should have a title AND a detailed outline description (2-4 sentences explaining what content should appear and how it should be presented).
5. Do NOT use generic filler content. Every slide must have unique educational value.
6. Generate all content in English.`
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
      // Store reference info so slide generation can use it
      referenceContext: referenceContext || undefined,
      referenceSources: extractedSources.length > 0 ? extractedSources : undefined,
    };

    // ---- Create Lesson + Slide records ----
    let lesson;

    if (existingLessonId) {
      // Re-generating: delete old slides, update lesson
      await db.slide.deleteMany({ where: { lessonId: existingLessonId } });
      lesson = await db.lesson.update({
        where: { id: existingLessonId },
        data: {
          title: result.lessonTitle,
          outlineJson: JSON.stringify(outlineData),
        },
      });
    } else {
      // Create new lesson
      lesson = await db.lesson.create({
        data: {
          courseId,
          title: result.lessonTitle,
          order: existingLessonCount,
          outlineJson: JSON.stringify(outlineData),
        },
      });
    }

    // Create slides from the outline
    await db.slide.createMany({
      data: result.slides.map((s, i) => ({
        title: s.title,
        htmlBody: "",
        status: "DRAFT_OUTLINE",
        order: i,
        lessonId: lesson.id,
      })),
    });

    // Fetch the created slides with their IDs
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
