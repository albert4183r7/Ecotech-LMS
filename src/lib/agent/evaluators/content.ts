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

WHAT IS NOT A PROBLEM

Naming the subject's real tools, standards, methods, patterns and terms —
ReAct, RAG, MCP, gradient descent, precision and recall, whatever this subject
actually uses. That vocabulary is the lesson. Requiring a source for it turned
lessons into pages of definitions, which is the failure this review exists to
catch, not to cause. Numbers inside an explicitly hypothetical worked example
("say it scores 99% on training data and 71% on held-out data") are likewise
fine: they illustrate, they do not claim.

BLOCKING problems:
- A figure, percentage, currency amount, date, study finding or quotation presented as fact about the real world, where the source material does not support it. If no source material was supplied, ANY such claim is blocking. A number inside a stated hypothetical is not this.
- A capability, statistic or practice attributed to a specific named organisation that the source did not attribute to them. Naming the organisation is fine; putting an unsupported claim in its mouth is not.
- A technical term introduced and never explained. The audience is meeting it for the first time; a name without a plain-language explanation teaches nothing.
- The same definition or the same example appearing on more than one slide.
- A term used on an earlier slide than the one that defines it.
- A slide whose text does not match its title.

ADVISORY problems:
- A slide that only defines. "X is a technique for Y" with nothing about how it works, what it costs, or when it fails.
- More than five points on a slide, or points longer than about fifteen words.
- Vague filler that states nothing concrete, or a sentence that would be equally true of a different subject.
- A slide that describes the lesson rather than teaching the subject.
- Compliance boilerplate, HR-policy language or generic corporate safety guidance, where the lesson is not about those.

Score out of 100. Deduct heavily for claims about the world that no source supports, and for slides that name things without explaining them.`;

const PEDAGOGY_SYSTEM = `You review whether a lesson actually teaches its subject.

BLOCKING problems:
- The lesson does not deliver what its title promises.
- A concept is used before it is introduced.
- The sequence does not build; slides could be shuffled without loss.
- Content is at the wrong level for the stated audience.
- The lesson stays at the level of definitions. A learner who read it would know what the words mean and still not be able to do anything.
- A slide is generic enough that it would fit a lesson on a different subject.

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
