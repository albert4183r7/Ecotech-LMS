import { createHash } from "node:crypto";
import { generateStructuredJSON } from "@/lib/ai";
import { DraftQuizSchema, repairQuiz, type DraftQuestion } from "@/lib/quiz/schema";
import type { LessonSource } from "@/lib/quiz/lesson-source";
import { validateQuestions } from "@/lib/quiz/validator";

export function questionFingerprint(prompt: string): string {
  const normalized = prompt
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

function promptTokens(prompt: string): Set<string> {
  return new Set(
    prompt
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 3),
  );
}

/** Catch light paraphrases as well as byte-for-byte duplicates. The model is
 * told what to avoid, but this mechanical gate is what guarantees a familiar
 * prompt does not slip into the learner's reserve. */
export function isNearDuplicate(prompt: string, prior: string[]): boolean {
  const candidate = promptTokens(prompt);
  if (candidate.size === 0) return false;
  return prior.some((seen) => {
    const previous = promptTokens(seen);
    if (previous.size === 0) return false;
    let shared = 0;
    for (const token of candidate) if (previous.has(token)) shared++;
    const union = candidate.size + previous.size - shared;
    return union > 0 && shared / union >= 0.72;
  });
}

/** Generate a small reserve of verified questions. Keeping a reserve makes the
 * sprint feel immediate after the first generation while still allowing it to
 * continue indefinitely as each reserve is mastered. */
export async function generateMasteryBatch(
  source: LessonSource,
  avoidedPrompts: string[],
  count = 4,
): Promise<DraftQuestion[]> {
  const avoid = avoidedPrompts
    .slice(-80)
    .map((prompt) => `- ${prompt}`)
    .join("\n");
  const draft = await generateStructuredJSON(
    `LESSON: ${source.lessonTitle}\nLANGUAGE: ${source.language}\n\n<lesson>\n${source.text}\n</lesson>\n\nWrite ${count} new multiple-choice practice questions. Vary recall, comparison, and application. Quote the exact supporting sentence in sourceQuote.\n\nQuestions this learner has already seen — do not repeat or lightly paraphrase them:\n${avoid || "(none)"}`,
    DraftQuizSchema,
    {
      task: "mastery-question",
      repair: repairQuiz,
      temperature: 0.85,
      systemInstruction:
        "You create adaptive student practice from exactly one lesson. Every question must be answerable from the supplied lesson alone, use four distinct choices with exactly one correct answer, and test a different idea from the avoided prompts. Reply in the lesson language.",
    },
  );

  const verdicts = await validateQuestions(draft.questions, source, "medium");
  const accepted: DraftQuestion[] = [];
  const seen = new Set<string>();
  draft.questions.forEach((question, index) => {
    const fingerprint = questionFingerprint(question.prompt);
    if (
      !verdicts[index]?.ok ||
      isNearDuplicate(question.prompt, [...avoidedPrompts, ...accepted.map((item) => item.prompt)]) ||
      seen.has(fingerprint)
    )
      return;
    seen.add(fingerprint);
    accepted.push(question);
  });
  return accepted.slice(0, count);
}
