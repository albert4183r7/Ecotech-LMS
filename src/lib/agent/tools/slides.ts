import { z } from "zod/v4";
import path from "node:path";
import { db } from "@/lib/db";
import { defineTool } from "../registry";
import {
  streamSlideHtml,
  collectStream,
  generateText,
  SLIDE_HTML_SYSTEM_PROMPT,
  INLINE_EDIT_SYSTEM_PROMPT,
} from "@/lib/ai";
import { sanitizeHtml, wrapSlideHtml, ensureCanvasDocument } from "@/lib/sanitize";
import { extractSlideText } from "@/lib/slides/text";
import { extractTextFromFiles, selectRelevantSections } from "@/lib/extract-doc";
import { renderSlide } from "@/lib/render/slide-renderer";

// ============================================
// Agent tools
//
// Wrappers over capabilities the LMS already had. The point is not new
// behaviour, it is making these callable by a model that decides when to use
// them. Sanitising and wrapping stay inside save_slide so the agent cannot
// route around them.
// ============================================

const MAX_REFERENCE_CHARS = 12_000;

export const getLessonContext = defineTool({
  name: "get_lesson_context",
  description:
    "Read the lesson: its title, every slide with position, status, and the visible text of any slide already generated. Use this before writing or revising so you know what the deck already says.",
  schema: z.object({
    lessonId: z.string().min(1).describe("The lesson to read"),
  }),
  async handler({ lessonId }) {
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: { slides: { orderBy: { order: "asc" } } },
    });
    if (!lesson) throw new Error(`Lesson ${lessonId} not found`);

    return {
      lessonId: lesson.id,
      title: lesson.title,
      slideCount: lesson.slides.length,
      slides: lesson.slides.map((s) => ({
        slideId: s.id,
        position: s.order + 1,
        title: s.title,
        status: s.status,
        text: s.htmlBody ? extractSlideText(s.htmlBody).slice(0, 400) : "",
      })),
    };
  },
});

export const retrieveReference = defineTool({
  name: "retrieve_reference",
  description:
    "Pull the passages most relevant to a query out of the documents uploaded for this course. Use it before making any factual claim. If it returns nothing, there is no source and you must not invent figures.",
  schema: z.object({
    query: z.string().min(3).describe("What you need to know"),
    fileUrls: z.array(z.string()).min(1).describe("Uploaded file paths, as stored on the lesson"),
    maxChars: z.number().int().min(500).max(MAX_REFERENCE_CHARS).optional(),
  }),
  async handler({ query, fileUrls, maxChars }) {
    const roots = path.join(process.cwd(), "public");
    const paths = fileUrls
      .map((u) => path.join(roots, u.replace(/^\//, "")))
      .filter((p) => path.normalize(p).startsWith(roots));

    if (paths.length === 0) return { found: false, text: "", sources: [] };

    const { text, sources, failures } = await extractTextFromFiles(paths);
    if (!text.trim()) return { found: false, text: "", sources, failures };

    return {
      found: true,
      text: selectRelevantSections(text, query, maxChars ?? MAX_REFERENCE_CHARS),
      sources,
      failures,
    };
  },
});

export const generateSlideHtml = defineTool({
  name: "generate_slide_html",
  description:
    "Write the HTML for one slide. Give it the slide's role in the deck, the exact points it must carry, and what earlier slides already covered. Returns HTML only — call save_slide to persist it.",
  schema: z.object({
    slideTitle: z.string().min(1),
    role: z
      .enum(["cover", "content", "comparison", "process", "data", "closing"])
      .describe("What this slide does in the deck; drives the layout"),
    keyPoints: z.array(z.string().min(5)).min(1).max(6).describe("Statements that must appear"),
    alreadyCovered: z
      .string()
      .optional()
      .describe("What earlier slides said, so you do not repeat"),
    designNotes: z.string().optional().describe("Layout and visual direction for this slide"),
    referenceText: z
      .string()
      .optional()
      .describe("Sourced material; all figures must come from here"),
  }),
  async handler(args) {
    const prompt = [
      `Slide title: ${args.slideTitle}`,
      `Slide role: ${args.role}`,
      "",
      "Content that must appear on this slide:",
      ...args.keyPoints.map((p) => `- ${p}`),
      args.designNotes ? `\nLayout direction: ${args.designNotes}` : "",
      args.alreadyCovered
        ? `\nEarlier slides already covered the following. Do not restate any of it:\n${args.alreadyCovered}`
        : "",
      args.referenceText
        ? `\nSOURCE MATERIAL. Every figure must come from here:\n<reference>${args.referenceText}</reference>`
        : "\nNo source material was supplied, so state points qualitatively and use no statistics.",
    ]
      .filter(Boolean)
      .join("\n");

    const html = await collectStream(streamSlideHtml(prompt, SLIDE_HTML_SYSTEM_PROMPT));
    if (!html.trim()) throw new Error("model returned no HTML");
    return { html: sanitizeHtml(html) };
  },
});

export const reviseSlideHtml = defineTool({
  name: "revise_slide_html",
  description:
    "Rewrite an existing slide to fix specific problems. Pass the findings verbatim so the rewrite addresses them rather than restyling at random.",
  schema: z.object({
    slideId: z.string().min(1),
    findings: z.array(z.string().min(5)).min(1).describe("What is wrong, one entry per problem"),
  }),
  async handler({ slideId, findings }) {
    const slide = await db.slide.findUnique({ where: { id: slideId } });
    if (!slide) throw new Error(`Slide ${slideId} not found`);
    if (!slide.htmlBody) throw new Error(`Slide ${slideId} has no content to revise`);

    const inner = /<div class="slide-canvas"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<script/i.exec(
      slide.htmlBody,
    );
    const body = inner?.[1] ?? /<body[^>]*>([\s\S]*)<\/body>/i.exec(slide.htmlBody)?.[1] ?? "";

    const prompt = [
      "Fix these problems in the slide below. Change only what the problems require.",
      ...findings.map((f) => `- ${f}`),
      "",
      "Current slide HTML:",
      body,
    ].join("\n");

    const revised = await generateText(prompt, INLINE_EDIT_SYSTEM_PROMPT);
    const cleaned = revised
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();
    if (!cleaned) throw new Error("model returned no HTML");
    return { html: sanitizeHtml(cleaned) };
  },
});

export const saveSlide = defineTool({
  name: "save_slide",
  description:
    "Persist HTML to a slide and mark it ready. Sanitising and the slide canvas are applied here, so always save through this tool.",
  schema: z.object({
    slideId: z.string().min(1),
    html: z.string().min(20),
    title: z.string().optional(),
  }),
  mutates: true,
  async handler({ slideId, html, title }) {
    const slide = await db.slide.findUnique({ where: { id: slideId } });
    if (!slide) throw new Error(`Slide ${slideId} not found`);

    const clean = sanitizeHtml(html);
    if (!clean.trim())
      throw new Error("nothing left after sanitising; the HTML was empty or unsafe");

    await db.slide.update({
      where: { id: slideId },
      data: {
        htmlBody: wrapSlideHtml(clean, { title: title ?? slide.title }),
        status: "READY",
        ...(title ? { title } : {}),
      },
    });
    return { slideId, saved: true, textLength: extractSlideText(clean).length };
  },
});

export const inspectSlideLayout = defineTool({
  name: "inspect_slide_layout",
  description:
    "Render a saved slide and measure its layout. Returns concrete faults — overflow, elements past the edge, unreadable text, how much of the slide is filled. Use this to check your own work.",
  schema: z.object({
    slideId: z.string().min(1),
  }),
  async handler({ slideId }) {
    const slide = await db.slide.findUnique({ where: { id: slideId } });
    if (!slide) throw new Error(`Slide ${slideId} not found`);
    if (!slide.htmlBody) throw new Error(`Slide ${slideId} has not been generated yet`);

    // Slides generated before the canvas existed must be re-wrapped, or they
    // measure as flawless because there is no canvas to measure against.
    const document = ensureCanvasDocument(slide.htmlBody, slide.title);
    const { faults, fillRatio } = await renderSlide(document, { deviceScaleFactor: 1 });
    return {
      slideId,
      faults: faults.map((f) => `${f.kind}: ${f.detail}`),
      fillPercent: Math.round(fillRatio * 100),
      clean: faults.length === 0,
    };
  },
});

export const slideTools = [
  getLessonContext,
  retrieveReference,
  generateSlideHtml,
  reviseSlideHtml,
  saveSlide,
  inspectSlideLayout,
] as const;
