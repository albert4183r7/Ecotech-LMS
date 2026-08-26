import { z } from "zod/v4";
import { generateStructuredJSON } from "@/lib/ai";
import type { DraftQuestion } from "./schema";
import type { LessonSource } from "./lesson-source";

// ============================================
// Quiz grounding validation
//
// A generated question is a claim about the lesson, and claims get checked.
// Two checks run in order, cheapest first: a mechanical one that catches the
// structural failures deterministically, then a model judgement for the ones
// that need reading.
// ============================================

export interface QuestionVerdict {
  index: number;
  ok: boolean;
  /** Why it was rejected, phrased so the generator can act on it. */
  reason?: string;
}

// ────────────────────────────────────────────────
// Mechanical checks
// ────────────────────────────────────────────────

const STOPWORDS = new Set(
  (
    "the a an and or but of to in on at by for from with as is are was were be been that which " +
    "this these those it its their you your we our they them not can will would should could may " +
    "what when where who how why does do did if then than there here about into over under"
  ).split(" "),
);

/** Chinese, Japanese and Korean text, which is written without spaces. */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/u;

/**
 * The words a piece of text is about.
 *
 * Splitting on anything outside a-z0-9 treated every Chinese character as a
 * separator, so a lesson written in Chinese produced no terms at all: its
 * quotes could not be compared to it, and the checks below passed or failed by
 * accident rather than by reading. CJK runs are indexed as overlapping
 * character pairs instead — the standard cheap way to compare text that has no
 * spaces in it — and Latin words keep the length and stopword filter that
 * makes them meaningful.
 */
function terms(text: string): Set<string> {
  const found = new Set<string>();
  const runs = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  for (const run of runs) {
    if (!CJK.test(run)) {
      if (run.length > 3 && !STOPWORDS.has(run)) found.add(run);
      continue;
    }
    // A mixed run — "rag检索" — is split into its scripts before indexing.
    for (const part of run.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{L}\p{N}]+/gu,
    ) ?? []) {
      if (!CJK.test(part)) {
        if (part.length > 3 && !STOPWORDS.has(part)) found.add(part);
        continue;
      }
      const chars = [...part];
      if (chars.length === 1) {
        found.add(chars[0]);
        continue;
      }
      for (let i = 0; i + 1 < chars.length; i++) found.add(chars[i] + chars[i + 1]);
    }
  }

  return found;
}

/**
 * Normalised for quote matching: case, punctuation and spacing collapsed.
 *
 * Letters and digits of every script survive. Keeping only a-z0-9 deleted a
 * Chinese quote entirely, which made it the empty string — and the empty
 * string is contained in every lesson, so the quote check silently passed
 * whatever it was given.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Checks that do not need a model.
 *
 * Exactly one correct option, four distinct choices, and a source quote that
 * genuinely appears in the lesson — a quote the lesson does not contain means
 * the question was written from something else, which is the exact failure the
 * grounding requirement is about.
 */
export function checkMechanically(question: DraftQuestion, source: LessonSource): string | null {
  const correct = question.options.filter((o) => o.isCorrect);
  if (correct.length !== 1) {
    return `has ${correct.length} correct options; exactly one option must be correct`;
  }

  const seen = new Set(question.options.map((o) => normalise(o.text)));
  if (seen.size !== question.options.length) {
    return "has duplicate answer choices; every option must be distinct";
  }
  if (question.options.some((o) => !o.text.trim())) {
    return "has an empty answer choice";
  }

  const haystack = normalise(source.text);
  const quote = normalise(question.sourceQuote);

  // Verbatim first, then a term-overlap fallback: a model often paraphrases
  // slightly while still pointing at real lesson content, and rejecting that
  // outright would throw away sound questions.
  if (!haystack.includes(quote)) {
    const quoteTerms = [...terms(question.sourceQuote)];
    const sourceTerms = terms(source.text);
    const overlap = quoteTerms.filter((t) => sourceTerms.has(t)).length;
    const ratio = quoteTerms.length ? overlap / quoteTerms.length : 0;
    if (ratio < 0.7) {
      return "cites a sourceQuote that does not appear in the lesson; quote the lesson exactly";
    }
  }

  // The answer has to be findable in the lesson, not merely the question.
  const answerTerms = [...terms(correct[0].text)];
  if (answerTerms.length > 0) {
    const sourceTerms = terms(source.text);
    const known = answerTerms.filter((t) => sourceTerms.has(t)).length;
    if (known / answerTerms.length < 0.34) {
      return "its correct answer uses terms the lesson never mentions; the answer must come from the lesson";
    }
  }

  return null;
}

// ────────────────────────────────────────────────
// Model judgement
// ────────────────────────────────────────────────

const JudgementSchema = z.object({
  verdicts: z.array(
    z.object({
      index: z.number().int().min(0).describe("Position of the question being judged"),
      answerableFromLesson: z
        .boolean()
        .describe("Could a learner who read only this lesson answer it?"),
      correctAnswerSupported: z
        .boolean()
        .describe("Does the lesson actually support the option marked correct?"),
      distractorsClearlyWrong: z
        .boolean()
        .describe("Are the other options wrong according to the lesson?"),
      introducesOutsideFacts: z
        .boolean()
        .describe("Does it rely on anything the lesson never states?"),
      problem: z.string().max(300).optional().describe("What is wrong, when something is"),
    }),
  ),
});

const JUDGE_SYSTEM = `You check quiz questions against the lesson they claim to come from.

The lesson text you are given is the entire world. Anything not in it does not
exist for this purpose, however true it may be generally — a question that
needs outside knowledge is a failure even when the knowledge is correct.

Judge each question on its own:
- answerableFromLesson: a learner who read only this lesson can answer it.
- correctAnswerSupported: the lesson states what the correct option claims.
- distractorsClearlyWrong: the other options contradict the lesson or are absent
  from it. Plausible is good; ambiguously also-correct is not.
- introducesOutsideFacts: it depends on something the lesson never says.

Be strict. Passing a question that cannot be answered from the lesson is worse
than failing a sound one.`;

/** Ask the model to judge each question against the lesson. */
export async function judgeAgainstLesson(
  questions: DraftQuestion[],
  source: LessonSource,
): Promise<QuestionVerdict[]> {
  if (questions.length === 0) return [];

  const listing = questions
    .map((q, i) => {
      const options = q.options
        .map(
          (o, n) =>
            `     ${String.fromCharCode(65 + n)}. ${o.text}${o.isCorrect ? "   <- marked correct" : ""}`,
        )
        .join("\n");
      return `[${i}] ${q.prompt}\n${options}`;
    })
    .join("\n\n");

  const prompt = `LESSON — the only source that counts:
<lesson>
${source.text}
</lesson>

QUESTIONS TO JUDGE:
${listing}

Return one verdict per question, using the index shown in brackets.`;

  try {
    const result = await generateStructuredJSON(prompt, JudgementSchema, {
      task: "quiz-grounding-judge",
      systemInstruction: JUDGE_SYSTEM,
      temperature: 0.1,
    });

    const byIndex = new Map(result.verdicts.map((v) => [v.index, v]));
    return questions.map((_, index) => {
      const verdict = byIndex.get(index);
      // No verdict means the judge skipped it. Treating that as a pass would
      // let an unjudged question through, so it is a failure to re-examine.
      if (!verdict) {
        return { index, ok: false, reason: "was not judged; regenerate it" };
      }
      const problems: string[] = [];
      if (!verdict.answerableFromLesson) problems.push("cannot be answered from the lesson alone");
      if (!verdict.correctAnswerSupported) {
        problems.push("its correct answer is not supported by the lesson");
      }
      if (!verdict.distractorsClearlyWrong) {
        problems.push("its incorrect options are not clearly wrong according to the lesson");
      }
      if (verdict.introducesOutsideFacts) problems.push("relies on facts outside the lesson");

      if (problems.length === 0) return { index, ok: true };
      return {
        index,
        ok: false,
        reason: [...problems, verdict.problem].filter(Boolean).join("; "),
      };
    });
  } catch (error) {
    // The judge being unavailable must not silently pass ungrounded questions,
    // but neither should it fail the whole lesson: the mechanical checks have
    // already run, and they cover the structural failures.
    console.warn(
      "[quiz] grounding judge unavailable, falling back to mechanical checks only:",
      error instanceof Error ? error.message : error,
    );
    return questions.map((_, index) => ({ index, ok: true }));
  }
}

/** Run both checks, cheapest first. */
export async function validateQuestions(
  questions: DraftQuestion[],
  source: LessonSource,
): Promise<QuestionVerdict[]> {
  const mechanical = questions.map((question, index) => {
    const problem = checkMechanically(question, source);
    return problem ? { index, ok: false, reason: problem } : { index, ok: true };
  });

  // Only questions that survived the cheap checks are worth a model call.
  const survivorIndexes = mechanical.filter((v) => v.ok).map((v) => v.index);
  if (survivorIndexes.length === 0) return mechanical;

  const judged = await judgeAgainstLesson(
    survivorIndexes.map((i) => questions[i]),
    source,
  );

  const verdicts = [...mechanical];
  judged.forEach((verdict, position) => {
    const originalIndex = survivorIndexes[position];
    if (!verdict.ok) verdicts[originalIndex] = { ...verdict, index: originalIndex };
  });
  return verdicts;
}
