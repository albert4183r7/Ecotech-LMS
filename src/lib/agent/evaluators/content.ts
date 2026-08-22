import { generateStructuredJSON } from "@/lib/ai";
import { EvaluationSchema, type EvaluationResult } from "./schema";

// ============================================
// Content and pedagogy critics
// ============================================

export interface LessonSnapshot {
  title: string;
  audience?: string;
  slides: { position: number; title: string; text: string }[];
  /** Source material, when the lesson was grounded in documents. */
  referenceText?: string;
}

const CONTENT_SYSTEM = `You review lesson slides for factual and structural quality. You are strict and specific.

Report a finding for each real problem. Do not pad the list, and do not report a problem you cannot point at.

BLOCKING problems:
- A statistic, percentage, currency amount, date, or study finding that does not appear in the source material. If no source material was supplied, ANY such figure is blocking.
- A claim attributed to a named company, product, or study that the source did not name.
- The same definition or the same example appearing on more than one slide.
- A term used on an earlier slide than the one that defines it.
- A slide whose text does not match its title.

ADVISORY problems:
- More than five points on a slide, or points longer than about fifteen words.
- Vague filler that states nothing concrete.
- A slide that describes the lesson rather than the subject.

Score out of 100. Deduct heavily for invented figures.`;

const PEDAGOGY_SYSTEM = `You review whether a lesson actually teaches its subject.

BLOCKING problems:
- The lesson does not deliver what its title promises.
- A concept is used before it is introduced.
- The sequence does not build; slides could be shuffled without loss.
- Content is at the wrong level for the stated audience.

ADVISORY problems:
- A claim that would be clearer with a concrete example.
- An abrupt jump in difficulty.
- A closing slide that adds nothing.

Judge the lesson as a learner meeting the subject for the first time. Score out of 100.`;

function renderSnapshot(lesson: LessonSnapshot): string {
  return [
    `Lesson title: ${lesson.title}`,
    lesson.audience ? `Intended audience: ${lesson.audience}` : "Intended audience: not specified",
    "",
    lesson.referenceText
      ? `SOURCE MATERIAL. Any figure not present here is invented:\n<reference>\n${lesson.referenceText.slice(0, 8000)}\n</reference>`
      : "NO SOURCE MATERIAL WAS SUPPLIED. Every statistic or named study in the slides is therefore invented.",
    "",
    "SLIDES:",
    ...lesson.slides.map((s) => `--- Slide ${s.position}: ${s.title}\n${s.text}`),
  ].join("\n");
}

export async function evaluateContent(lesson: LessonSnapshot): Promise<EvaluationResult> {
  return generateStructuredJSON(renderSnapshot(lesson), EvaluationSchema, {
    task: "content-evaluation",
    systemInstruction: CONTENT_SYSTEM,
    temperature: 0.1,
  });
}

export async function evaluatePedagogy(lesson: LessonSnapshot): Promise<EvaluationResult> {
  return generateStructuredJSON(renderSnapshot(lesson), EvaluationSchema, {
    task: "content-evaluation",
    systemInstruction: PEDAGOGY_SYSTEM,
    temperature: 0.1,
  });
}
