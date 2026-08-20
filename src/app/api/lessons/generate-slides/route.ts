import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isRetryable, SLIDE_ATTEMPTS } from "@/lib/slide-status";
import { streamSlideHtml, collectStream, SLIDE_HTML_SYSTEM_PROMPT } from "@/lib/ai";
import { sanitizeHtml, wrapSlideHtml } from "@/lib/sanitize";
import {
  slideBrief,
  extractSlideText,
  buildCoveredContext,
  type StoredOutline,
  type SlideBrief,
} from "@/lib/lesson-outline";

// ============================================
// Style-specific system prompt additions
// ============================================

const STYLE_INSTRUCTIONS: Record<string, string> = {
  professional:
    "Use a clean corporate palette (navy, white, gray). Strong title hierarchy. Use accent bars and subtle borders for structure.",
  minimal:
    "Use ample whitespace, one accent color, clean sans-serif. Let the content breathe. Very few elements per slide.",
  creative:
    "Use bold vibrant colors, asymmetric layouts, large typography. Be visually daring with gradients and color blocks.",
  academic:
    "Use a formal, structured layout. Clean headers, organized content blocks. Professional and serious tone.",
  tech: "Use dark backgrounds (dark slate/gray), neon accents (cyan, green, purple). Monospace fonts for technical terms. Futuristic feel.",
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

// ============================================
// Helper: build per-slide system prompt
// ============================================

function buildSystemPrompt(style: string): string {
  const styleInstruction = STYLE_INSTRUCTIONS[style] || "";
  return `${SLIDE_HTML_SYSTEM_PROMPT}

${styleInstruction ? `STYLE DIRECTION: ${styleInstruction}` : ""}`;
}

// ============================================
// Helper: build per-slide user prompt
//
// Carries the outline's actual content (key points, named terms, layout) plus
// a digest of what earlier slides already said, so the model neither invents
// substance nor repeats itself.
// ============================================

interface SlidePromptParams {
  topic: string;
  slideTitle: string;
  brief: SlideBrief;
  position: number;
  totalSlides: number;
  isChinese: boolean;
  prevTitle: string;
  nextTitle: string;
  coveredContext: string;
  referenceContext?: string;
}

function buildRoleGuidance(position: number, totalSlides: number, isChinese: boolean): string {
  const isFirst = position === 0;
  const isLast = position === totalSlides - 1;
  const isSecond = position === 1;

  if (isFirst) {
    return isChinese
      ? `这是第 1 张 = 封面页。
- 大标题居中，副标题在下方
- 加一个装饰性色块或线条
- 只放标题和副标题，内容留给后面的幻灯片`
      : `This is slide 1 = COVER SLIDE.
- Large centred title with the subtitle beneath it
- Add one decorative accent bar or colour block
- Title and subtitle only — the content belongs on later slides`;
  }

  if (isLast) {
    return isChinese
      ? `这是最后一张 = 结束页。
- 大字显示"谢谢"或"Q&A"
- 可以加一句与主题相关的收尾语
- 保持简洁`
      : `This is the LAST slide = CLOSING SLIDE.
- Large text: "Thank You" or "Questions?"
- Optionally one closing line tied to the subject
- Keep it clean`;
  }

  if (isSecond && totalSlides > 3) {
    return isChinese
      ? `这是第 2 张 = 主题切入页。
- 标题在顶部，下面用卡片或色块呈现要点
- 直接给出关于主题的具体信息`
      : `This is slide 2 = the slide that opens up the subject.
- Title at the top, key points below as cards or colour blocks
- Lead with concrete information about the subject itself`;
  }

  return "";
}

function buildUserPrompt(params: SlidePromptParams): string {
  const {
    topic,
    slideTitle,
    brief,
    position,
    totalSlides,
    isChinese,
    prevTitle,
    nextTitle,
    coveredContext,
    referenceContext,
  } = params;

  const roleGuidance = buildRoleGuidance(position, totalSlides, isChinese);

  const contentBlock =
    brief.keyPoints.length > 0
      ? `${isChinese ? "这张幻灯片的内容（必须全部呈现，可以改写措辞使其更简短有力）:" : "CONTENT FOR THIS SLIDE (present all of it; you may tighten the wording):"}
${brief.keyPoints.map((point) => `- ${point}`).join("\n")}`
      : `${isChinese ? "内容要点" : "Key points"}: ${slideTitle}`;

  const termsBlock =
    brief.terms.length > 0
      ? `\n${isChinese ? "必须提到的具体名称:" : "Specific names that must appear:"} ${brief.terms.join(", ")}`
      : "";

  const layoutBlock = brief.layout
    ? `\n${isChinese ? "版式建议:" : "Layout direction:"} ${brief.layout}`
    : "";

  const coveredBlock = coveredContext
    ? `\n\n${isChinese ? "前面的幻灯片已经讲过以下内容 — 不要重复这些定义或例子:" : "EARLIER SLIDES ALREADY COVERED THIS — do not repeat these definitions or examples:"}
${coveredContext}`
    : "";

  const neighbours =
    prevTitle || nextTitle
      ? `\n${
          isChinese
            ? `相邻幻灯片：上一张"${prevTitle}"，下一张"${nextTitle}"。这张的版式要与它们不同。`
            : `Neighbouring slides: previous "${prevTitle}", next "${nextTitle}". Use a different layout from both.`
        }`
      : "";

  const referenceSection = referenceContext
    ? `\n\n${isChinese ? "参考资料（内容必须基于此材料）:" : "REFERENCE MATERIAL (content must be based on this source):"}
<reference>${referenceContext}</reference>`
    : "";

  const writingRules = isChinese
    ? `写作要求：
- 写主题本身，而不是写这门课的安排。
- 每个要点一行，最多 10-15 个字，不要写整段文字。
- 不要编造统计数字、百分比、金额、日期或研究结论。${referenceContext ? "数字只能来自参考资料。" : "没有来源时用定性表述代替数字。"}
- 使用视觉化排布：卡片、色块、编号、强调条。
- 不要放视频、表单或"查看演示"之类的按钮和链接 — 幻灯片是静态的。`
    : `WRITING RULES:
- Write about the subject itself, not about the lesson or what a learner will do.
- One line per point, 10-15 words maximum. No paragraphs.
- Do not invent statistics, percentages, currency amounts, dates, or study results. ${referenceContext ? "Numbers may come only from the reference material." : "Where no source supports a number, make the point qualitatively."}
- Use visual arrangement: cards, colour blocks, numbered badges, accent bars.
- No video, forms, or "View Demo" style buttons and links — the slide is static.`;

  return `${isChinese ? "演示主题" : "Presentation subject"}: ${topic}

${isChinese ? "当前幻灯片" : "Current slide"}: "${slideTitle}" (${isChinese ? "第" : "slide "}${position + 1} ${isChinese ? "张，共" : "of "}${totalSlides})

${contentBlock}${termsBlock}${layoutBlock}
${roleGuidance}${neighbours}${coveredBlock}

${writingRules}${referenceSection}`;
}

// ============================================
// Helper: per-slide timeout wrapper
// ============================================

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ============================================
// Core: generate all slides for a lesson
// Runs in the background, updates DB as slides complete
// ============================================

async function generateAllSlides(lessonId: string, language?: string): Promise<void> {
  // Load EVERY slide in the lesson, not just the pending ones. A slide's
  // position in the finished deck decides whether it is the cover or the
  // closing slide; deriving that from the pending subset meant a retry turned
  // a middle slide into a "Thank You" slide.
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: {
      course: { select: { id: true, language: true } },
      slides: { orderBy: { order: "asc" } },
    },
  });

  if (!lesson || lesson.slides.length === 0) {
    console.error(`[generate-slides] Lesson ${lessonId} not found or no slides`);
    return;
  }

  const deck = lesson.slides;
  const totalSlides = deck.length;
  const pending = deck.filter((s) => isRetryable(s.status, s.updatedAt));

  if (pending.length === 0) {
    console.log(`[generate-slides] Lesson ${lessonId}: nothing pending`);
    return;
  }

  console.log(
    `[generate-slides] Lesson ${lessonId}: ${pending.length} pending of ${totalSlides} slides`,
  );

  const effectiveLanguage = language || lesson.course?.language || "english";
  const isChinese = effectiveLanguage === "chinese";

  let outlineJson: StoredOutline;
  try {
    outlineJson = lesson.outlineJson
      ? (JSON.parse(lesson.outlineJson) as StoredOutline)
      : { topic: lesson.title, style: "professional", slides: [] };
  } catch {
    outlineJson = { topic: lesson.title, style: "professional", slides: [] };
  }

  const style = outlineJson.style || "professional";
  const topic = outlineJson.topic || lesson.title;
  const outlineSlides = outlineJson.slides || [];
  const referenceContext = outlineJson.referenceContext;
  const systemPrompt = buildSystemPrompt(style);

  // Seed the "already covered" digest with slides that are already finished so
  // a retry does not re-derive definitions the deck already contains.
  const covered: { title: string; text: string }[] = deck
    .filter((s) => s.status === "READY" && s.htmlBody)
    .map((s) => ({ title: s.title, text: extractSlideText(s.htmlBody) }));

  // ---- Process each pending slide ----
  for (const slide of pending) {
    // True position in the deck, independent of which slides are pending.
    const position = deck.findIndex((s) => s.id === slide.id);
    const label = `${position + 1}/${totalSlides}`;
    console.log(`[generate-slides] Slide ${label}: "${slide.title}" (id: ${slide.id})`);

    // Match by position — titles are not unique and are not a stable key.
    const outlineEntry =
      outlineSlides[position] ?? outlineSlides.find((s) => s.title === slide.title);
    const brief = slideBrief(outlineEntry);

    try {
      await db.slide.update({ where: { id: slide.id }, data: { status: "GENERATING" } });
    } catch (dbErr) {
      console.error(`[generate-slides] DB status update error for slide ${slide.id}:`, dbErr);
    }

    const userPrompt = buildUserPrompt({
      topic,
      slideTitle: slide.title,
      brief,
      position,
      totalSlides,
      isChinese,
      prevTitle: position > 0 ? (deck[position - 1]?.title ?? "") : "",
      nextTitle: position < totalSlides - 1 ? (deck[position + 1]?.title ?? "") : "",
      coveredContext: buildCoveredContext(covered),
      referenceContext,
    });

    let lastError = "";
    let done = false;

    for (let attempt = 1; attempt <= SLIDE_ATTEMPTS && !done; attempt++) {
      try {
        console.log(`[generate-slides] Slide ${label}, attempt ${attempt}/${SLIDE_ATTEMPTS}...`);
        const fullHtml = await withTimeout(
          collectStream(streamSlideHtml(userPrompt, systemPrompt)),
          SLIDE_TIMEOUT_MS,
          `generate slide ${label}`,
        );

        const sanitized = sanitizeHtml(fullHtml);
        if (!sanitized.trim()) throw new Error("model returned no usable HTML");

        const wrapped = wrapSlideHtml(sanitized, { title: slide.title });

        await db.slide.update({
          where: { id: slide.id },
          data: { htmlBody: wrapped, status: "READY" },
        });

        covered.push({ title: slide.title, text: extractSlideText(sanitized) });
        console.log(`[generate-slides] Slide ${label} COMPLETE (${fullHtml.length} chars)`);
        done = true;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Failed to generate slide HTML";
        console.error(`[generate-slides] Slide ${label} attempt ${attempt} failed: ${lastError}`);
        // Back off briefly before a second attempt; a rate limit or a blip is
        // the common cause and an immediate retry tends to hit it again.
        if (attempt < SLIDE_ATTEMPTS) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }

    if (!done) {
      // Leave it in ERROR. The next pass picks ERROR slides up, so this is
      // recoverable rather than terminal.
      console.error(`[generate-slides] Slide ${label} exhausted attempts: ${lastError}`);
      try {
        await db.slide.update({ where: { id: slide.id }, data: { status: "ERROR" } });
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
      return NextResponse.json({ success: false, error: "lessonId is required" }, { status: 400 });
    }

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: {
        slides: { orderBy: { order: "asc" } },
      },
    });

    if (!lesson) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    const retryable = lesson.slides.filter((s) => isRetryable(s.status, s.updatedAt));

    if (retryable.length === 0) {
      return NextResponse.json(
        { success: false, error: "Every slide in this lesson is already generated" },
        { status: 400 },
      );
    }

    const totalSlides = retryable.length;

    // Start generation in background (fire-and-forget)
    generateAllSlides(lessonId, language).catch((err) => {
      console.error(`[generate-slides] Background generation failed:`, err);
    });

    return NextResponse.json({
      success: true,
      data: { lessonId, totalSlides, status: "generating" },
    });
  } catch (error) {
    console.error("[generate-slides] POST error:", error);
    const message = error instanceof Error ? error.message : "Failed to start slide generation";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
