import { createHash } from "node:crypto";
import { z } from "zod/v4";
import { generateStructuredJSON } from "@/lib/ai";
import type { LessonSource, LessonSourceSlide } from "@/lib/quiz/lesson-source";

const SceneNarrationSchema = z.object({
  slideNumber: z.number().int().min(1),
  narration: z.string().min(20).max(1400),
});

export interface NarrationSceneDraft {
  slideId: string;
  order: number;
  narration: string;
  caption: string;
  sourceHash: string;
}

export interface NarrationDraft {
  sourceHash: string;
  scenes: NarrationSceneDraft[];
}

const SYSTEM = `You write the spoken narration for a slide-based lesson.

The slides are the only source of truth. Explain their ideas clearly and
naturally, but never add a fact, statistic, example or conclusion that the
slides do not support. The learner can see the current slide while listening.

Write exactly one narration scene for every slide, in slide order.
- Do not merely read the slide word for word. Connect its points into a concise
  explanation that helps a learner understand what is shown.
- Sound like a human instructor speaking to a learner, not a report being read.
- Prefer short, varied sentences. Use commas, colons and occasional dashes to
  create natural pauses, and avoid packing several ideas into one long sentence.
- Use simple conversational transitions where the slide supports them.
- Use the same language as the lesson.
- Refer naturally to what is visible, without saying "as an AI".
- Cover and closing slides should be brief. Teaching slides may be longer.
- End a scene cleanly so the player can transition to the next slide.
- narration is also used as the accessible caption, so avoid stage directions,
  markdown, SSML and pronunciation annotations.`;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const CLOSING_SIGNAL =
  /\b(?:thank you|thanks|happy learning|enjoy learning|the end|questions?|q\s*&\s*a|terima kasih|selamat belajar)\b|谢谢|感谢|学习愉快/iu;

const CLOSING_PHRASES: ReadonlyArray<readonly [RegExp, string, "en" | "id" | "zh"]> = [
  [/\bthank you\b/iu, "Thank you.", "en"],
  [/\bthanks\b/iu, "Thanks.", "en"],
  [/\bhappy learning\b/iu, "Happy learning!", "en"],
  [/\benjoy learning\b/iu, "Enjoy learning!", "en"],
  [/\bthe end\b/iu, "The end.", "en"],
  [/\bterima kasih\b/iu, "Terima kasih.", "id"],
  [/\bselamat belajar\b/iu, "Selamat belajar!", "id"],
  [/谢谢/u, "谢谢。", "zh"],
  [/感谢/u, "感谢。", "zh"],
  [/学习愉快/u, "学习愉快！", "zh"],
];

function asSentence(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || /[.!?。！？]$/u.test(text)) return text;
  return `${text}.`;
}

/**
 * Cover and explicit sign-off slides do not need creative rewriting. Keeping
 * them deterministic prevents a closing scene from summarising earlier slides
 * merely because the model saw the whole deck in the same request.
 */
export function deterministicEdgeNarration(
  slide: Pick<LessonSourceSlide, "title" | "text">,
  index: number,
  total: number,
  language = "",
): string | null {
  if (index === 0) return asSentence(slide.title);
  if (index !== total - 1) return null;

  const visibleText = `${slide.title} ${slide.text}`.replace(/\s+/g, " ").trim();
  if (!CLOSING_SIGNAL.test(visibleText)) return null;

  const languageGroup = /chinese|mandarin|中文|简体|繁体/iu.test(language)
    ? "zh"
    : /indones|bahasa/iu.test(language)
      ? "id"
      : /english|^en(?:[-_]|$)/iu.test(language)
        ? "en"
        : null;
  const exactVisiblePhrases = CLOSING_PHRASES.filter(
    ([pattern, , phraseLanguage]) =>
      pattern.test(visibleText) && (!languageGroup || phraseLanguage === languageGroup),
  ).map(([, phrase]) => phrase);
  return exactVisiblePhrases.length > 0
    ? [...new Set(exactVisiblePhrases)].join(" ")
    : asSentence(slide.title);
}

/** Fingerprint the exact slide words a narration scene was grounded in. */
export function narrationSourceHash(
  slide: Pick<LessonSourceSlide, "id" | "title" | "text">,
): string {
  return hash(`${slide.id}\0${slide.title}\0${slide.text}`);
}

/** Generate one grounded narration scene for every final slide. */
export async function generateNarration(
  source: LessonSource,
  language: string,
): Promise<NarrationDraft> {
  const expectedNumbers = new Set(source.slides.map((slide) => slide.number));
  const NarrationSchema = z.object({
    scenes: z
      .array(SceneNarrationSchema)
      .length(source.slides.length)
      .superRefine((scenes, ctx) => {
        const received = new Set(scenes.map((scene) => scene.slideNumber));
        if (
          received.size !== expectedNumbers.size ||
          [...expectedNumbers].some((number) => !received.has(number))
        ) {
          ctx.addIssue({
            code: "custom",
            message: "scenes must contain every slideNumber exactly once",
          });
        }
      }),
  });

  const lessonText = source.slides
    .map(
      (slide) =>
        `<slide number="${slide.number}" title=${JSON.stringify(slide.title)}>
${slide.text}
</slide>`,
    )
    .join("\n\n");

  const result = await generateStructuredJSON(
    `LESSON: ${source.lessonTitle}
LANGUAGE: ${language}

${lessonText}

Write exactly ${source.slides.length} narration scenes.`,
    NarrationSchema,
    {
      task: "video-script-authoring",
      systemInstruction: SYSTEM,
      temperature: 0.45,
    },
  );

  const byNumber = new Map(result.scenes.map((scene) => [scene.slideNumber, scene]));
  const scenes = source.slides.map((slide, order) => {
    const narration =
      deterministicEdgeNarration(slide, order, source.slides.length, language) ||
      byNumber.get(slide.number)?.narration.trim();
    if (!narration) throw new Error(`Narration is missing for slide ${slide.number}.`);
    return {
      slideId: slide.id,
      order,
      narration,
      caption: narration,
      sourceHash: narrationSourceHash(slide),
    };
  });

  return {
    sourceHash: hash(scenes.map((scene) => scene.sourceHash).join("\n")),
    scenes,
  };
}
