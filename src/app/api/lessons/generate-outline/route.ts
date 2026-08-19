import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateStructuredJSON } from "@/lib/llm";
import {
  OutlineResponseSchema,
  repairOutlineResponse,
  enforceSlideCount,
  MAX_SLIDE_TITLE_CHARS,
  MIN_KEY_POINTS,
  MAX_KEY_POINTS,
  MAX_TERMS,
  type OutlineResponse,
} from "@/lib/lesson-outline";
import { SLIDE_STYLES, VALID_STYLES, MIN_SLIDES, MAX_SLIDES } from "@/lib/slide-styles";
import { extractTextFromFiles, truncateTextForContext } from "@/lib/extract-doc";
import path from "path";

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
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
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
    const styleDescription = styleInfo ? `${styleInfo.label} (${styleInfo.description})` : style;

    const referenceSection = referenceContext
      ? `
${isChinese ? "参考材料（大纲内容必须基于此材料，保留关键术语和事实）:" : "REFERENCE MATERIAL (outline MUST be based on this content — preserve key terms, facts, and data):"}

<reference_documents>
${referenceContext}
</reference_documents>
`
      : "";

    const renderingConstraints = isChinese
      ? `渲染限制（幻灯片是静态 HTML）：
- 没有视频、音频、动画、表单、测验或任何交互元素。
- 不要引用外部演示、下载或链接按钮。
- 内容必须以文字和简单的视觉区块呈现。`
      : `RENDERING CONSTRAINTS (slides render as static HTML):
- No video, audio, animation, forms, quizzes, or interactive elements.
- No links or buttons pointing at external demos or downloads.
- Content must work as text and simple visual blocks.`;

    const groundingRules = isChinese
      ? `内容准确性：
- ${referenceContext ? "每一条陈述都必须来自上面的参考材料，保留其中的术语、数据和事实。" : "只写该主题中确立的、广为记录的知识。"}
- 不要编造统计数字、百分比、金额、日期、研究结论或公司指标。${referenceContext ? "只使用参考材料中出现的数字。" : "如果没有可靠来源，请用定性表述代替数字。"}
- 优先写该主题当前的主流实践，并指名当今实际使用的工具与标准。`
      : `FACTUAL GROUNDING:
- ${referenceContext ? "Every statement must come from the reference material above. Preserve its terms, figures, and facts." : "Write only well-established, widely documented knowledge about the subject."}
- Do not invent statistics, percentages, currency amounts, dates, study results, or company metrics. ${referenceContext ? "Use only numbers that appear in the reference material." : "Where a number would strengthen a point but no source supports it, make the point qualitatively instead."}
- Favour current mainstream practice, and name the tools, standards, and examples actually in use today for this subject.`;

    const prompt = `${isChinese ? "主题" : "SUBJECT"}: ${topic}
${isChinese ? "（如果上面写成“做一个关于 X 的课程”这样的指令，那么主题就是 X。）" : '(If the subject is phrased as an instruction such as "create a lesson about X", the subject matter is X.)'}
${isChinese ? "幻灯片数量" : "NUMBER OF SLIDES"}: ${clampedCount}
${isChinese ? "视觉风格" : "VISUAL STYLE"}: ${styleDescription}
${referenceSection}
${
  isChinese
    ? `你要为这个主题写出幻灯片的**实际内容**。你写下的每一句话都会原样出现在幻灯片上。

每张幻灯片提供：
- title：幻灯片标题，少于 ${MAX_SLIDE_TITLE_CHARS} 个字符
- keyPoints：${MIN_KEY_POINTS}-${MAX_KEY_POINTS} 条会出现在幻灯片上的具体陈述。每一条都是关于主题本身的完整、具体的说明——不是"介绍……"或"解释……"这类写作指示
- terms：最多 ${MAX_TERMS} 个必须提到的具体名称（技术、标准、真实案例）
- layout：这张幻灯片的视觉排布方式

幻灯片角色：
- 第 1 张是封面：标题加一句副标题。
- 第 ${clampedCount} 张是结束页。
- 中间每一张都要推进主题；任意两张不得重复同一个定义或同一个例子。

写作要求：
- 写主题本身，而不是写这门课。陈述描述的是事物，不是学习安排。
- 开场用一个关于主题的具体事实或例子。
- 每条 keyPoint 都要有实质内容，能独立成立。

${groundingRules}

${renderingConstraints}

- 用中文生成所有内容。`
    : `Write the **actual content** of the slides for this subject. Every sentence you write will appear on a slide verbatim.

For each slide provide:
- title: the slide heading, under ${MAX_SLIDE_TITLE_CHARS} characters
- keyPoints: ${MIN_KEY_POINTS}-${MAX_KEY_POINTS} specific statements that will appear on the slide. Each one is a complete, concrete statement about the subject itself — not a writing instruction like "introduce..." or "explain..."
- terms: up to ${MAX_TERMS} specific named things that must be mentioned (technologies, standards, real examples)
- layout: how this slide should be arranged visually

Slide roles:
- Slide 1 is the cover: the title plus a one-line subtitle.
- Slide ${clampedCount} is the closing slide.
- Every middle slide advances the subject; no two slides may repeat the same definition or the same example.

How to write:
- Write about the subject, not about the lesson. Statements describe the thing itself, not what a learner will do.
- Open with a concrete fact or example about the subject.
- Every key point must carry substance and stand on its own.

${groundingRules}

${renderingConstraints}

- Generate all content in English.`
}`;

    // ---- Call LLM ----
    console.log(
      `[generate-outline] Calling LLM for topic: "${topic}", ${clampedCount} slides, ${style}`,
    );
    let result: OutlineResponse;
    try {
      result = await generateStructuredJSON(prompt, OutlineResponseSchema, {
        repair: repairOutlineResponse,
      });
      console.log(
        `[generate-outline] LLM returned ${result.slides.length} slides, title: "${result.lessonTitle}"`,
      );
    } catch (llmError) {
      console.error("[generate-outline] LLM call failed:", llmError);
      const msg =
        llmError instanceof Error ? llmError.message : "AI service unavailable. Please try again.";
      return NextResponse.json({ success: false, error: msg }, { status: 502 });
    }

    // ---- Enforce the requested slide count ----
    // The model does not reliably honour it (a 3-slide request returned 4).
    const counted = enforceSlideCount(result.slides, clampedCount);
    if (counted.warning) {
      console.warn(`[generate-outline] ${counted.warning}`);
    }
    const outlineSlides = counted.slides.map((slide, i) => ({ ...slide, slideNumber: i + 1 }));

    // ---- Determine lesson count for ordering ----
    const existingLessonCount = await db.lesson.count({ where: { courseId } });

    // Build outlineJson with reference source info for slide generation
    const outlineData = {
      topic,
      style,
      slideCount: clampedCount,
      language,
      slides: outlineSlides,
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
      data: outlineSlides.map((s, i) => ({
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
