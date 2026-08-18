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
  existingLessonId?: string; // If re-generating outline for existing lesson
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateOutlineRequest;
    const { courseId, topic, slideCount, style, language = "english", existingLessonId } = body;

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

    // ---- Build the LLM prompt ----
    const styleInfo = SLIDE_STYLES.find((s) => s.value === style);
    const styleDescription = styleInfo
      ? `${styleInfo.label} (${styleInfo.description})`
      : style;

    const prompt = `${isChinese ? "课程主题" : "Topic"}: ${topic}
${isChinese ? "幻灯片数量" : "Number of slides"}: ${clampedCount}
${isChinese ? "设计风格" : "Design style"}: ${styleDescription}

${isChinese
  ? "请为以上主题生成一个课程幻灯片大纲。每个幻灯片应包含一个标题和简要的内容大纲描述。用中文生成。"
  : `Generate a slide outline for the given topic. Each slide should have a clear title and a brief outline describing its content. Generate in English.`
}

${isChinese
  ? "请确保幻灯片逻辑流畅，从介绍到总结。"
  : "Ensure the slides flow logically from introduction to conclusion."
}`;

    // ---- Call LLM ----
    const result: OutlineResponse = await generateStructuredJSON(prompt, OutlineResponseSchema);

    // ---- Determine lesson count for ordering ----
    const existingLessonCount = await db.lesson.count({ where: { courseId } });

    // ---- Create Lesson + Slide records ----
    let lesson;

    if (existingLessonId) {
      // Re-generating: delete old slides, update lesson
      await db.slide.deleteMany({ where: { lessonId: existingLessonId } });
      lesson = await db.lesson.update({
        where: { id: existingLessonId },
        data: {
          title: result.lessonTitle,
          outlineJson: JSON.stringify({
            topic,
            style,
            slideCount: clampedCount,
            language,
            slides: result.slides,
          }),
        },
      });
    } else {
      // Create new lesson
      lesson = await db.lesson.create({
        data: {
          courseId,
          title: result.lessonTitle,
          order: existingLessonCount,
          outlineJson: JSON.stringify({
            topic,
            style,
            slideCount: clampedCount,
            language,
            slides: result.slides,
          }),
        },
      });
    }

    // Create slides from the outline
    const slides = await db.slide.createMany({
      data: result.slides.map((s, i) => ({
        title: s.title,
        htmlBody: "", // Empty until actual HTML generation
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
    console.error("Error generating outline:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate outline. Please try again.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
