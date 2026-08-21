import { streamText } from "@/lib/llm";
import type { LessonSource } from "@/lib/quiz/lesson-source";

// ============================================
// The lesson's AI assistant
//
// A tutor for one lesson, which is the whole of its remit. Every answer has
// to come out of the lesson the learner currently has open: not the model's
// general knowledge, not another lesson in the same course, not the course
// description. That boundary is set here rather than in the route, so the
// prompt and the context that backs it stay in one place.
//
// The lesson text is assembled by loadLessonSource — the same function the
// quiz generator grounds on, for the same reason. There is no second
// extraction path and no separate retrieval system.
// ============================================

/** One turn of the conversation, as the client replays it. */
export interface TutorTurn {
  role: "user" | "assistant";
  content: string;
}

export interface TutorRequest {
  source: LessonSource;
  /** The slide on screen, so "this slide" and "the second one" resolve. */
  currentSlideNumber?: number;
  question: string;
  history: TutorTurn[];
}

/** Longest question we will carry. Past this it is a paste, not a question. */
export const MAX_QUESTION_CHARS = 1000;
/** Turns of history replayed. Enough for follow-ups, bounded for cost. */
export const MAX_HISTORY_TURNS = 10;
/**
 * Ceiling on the lesson text sent with a turn.
 *
 * A generated lesson is a few thousand characters, so this normally includes
 * all of it. When a lesson is longer than the budget, the slide the learner is
 * looking at and its neighbours are kept and the far ends are dropped, rather
 * than truncating at the end and losing whatever they are asking about.
 */
export const MAX_LESSON_CHARS = 12000;

/**
 * The lesson as the assistant may see it, centred on the current slide.
 *
 * Slides are added outward from the one on screen until the budget is spent,
 * then re-sorted, so what survives is a contiguous window around the learner's
 * position rather than an arbitrary prefix.
 */
export function buildLessonContext(source: LessonSource, currentSlideNumber?: number): string {
  const current = currentSlideNumber ?? source.slides[0]?.number ?? 1;
  const byDistance = [...source.slides].sort(
    (a, b) => Math.abs(a.number - current) - Math.abs(b.number - current),
  );

  const kept: typeof byDistance = [];
  let budget = MAX_LESSON_CHARS;
  for (const slide of byDistance) {
    const cost = slide.title.length + slide.text.length + 24;
    if (kept.length > 0 && cost > budget) continue;
    kept.push(slide);
    budget -= cost;
  }
  kept.sort((a, b) => a.number - b.number);

  const omitted = source.slides.length - kept.length;
  const body = kept
    .map(
      (s) =>
        `--- Slide ${s.number}${s.number === current ? " (the learner is looking at this one)" : ""}: ${s.title} ---\n${s.text}`,
    )
    .join("\n\n");

  return omitted > 0
    ? `${body}\n\n(${omitted} further slide(s) of this lesson are not included here.)`
    : body;
}

/** The boundary, stated to the model. */
export function buildSystemPrompt(source: LessonSource, lessonContext: string): string {
  return `You are the AI learning assistant for one lesson of an online course. You help the student understand the lesson they are studying right now.

COURSE: ${source.courseTitle}
LESSON: ${source.lessonTitle}
LESSON ID: ${source.lessonId}

You may ONLY answer using the lesson content below. It is the entire body of material you are permitted to draw on.

RULES:
- Answer questions about this lesson: what it says, what a term in it means, what an example in it shows, what a particular slide is getting at, and how its ideas relate to each other.
- Do NOT answer questions unrelated to this lesson, and do not use general world knowledge to answer them. Current events, other subjects, personal advice, writing code, and anything else outside this material are all out of scope.
- Do NOT answer questions about a different lesson, even one in the same course. You do not have its content and must not guess at it.
- When a question is outside this lesson, say so plainly and invite them back to the material — for example: "I can only help with the material in this lesson. Try asking me about ${source.lessonTitle}."
- When the question is about this lesson but the content does not go far enough to answer it, say that this lesson does not cover it. Do not fill the gap from your own knowledge.
- Never invent lesson content, and never attribute a claim to the lesson that is not in the text below.
- Follow-up questions refer to the conversation so far. Resolve "it", "that", and "why" against what was already said, while staying inside this lesson.
- Be brief and direct. A few sentences is usually right. Use the lesson's own vocabulary. Plain text only — no markdown headings or code fences.

LESSON CONTENT
==============
${lessonContext}
==============
Nothing beyond this content is available to you.`;
}

/**
 * Answer a question about the lesson, streaming the reply.
 *
 * The lesson context is rebuilt from the database on every request, so the
 * scope cannot be widened by anything the client sends: the history it
 * replays is the conversation's text and never the material.
 */
export async function* answerLessonQuestion(
  request: TutorRequest,
): AsyncGenerator<string, void, undefined> {
  const context = buildLessonContext(request.source, request.currentSlideNumber);
  const system = buildSystemPrompt(request.source, context);

  const transcript = request.history
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => `${t.role === "user" ? "Student" : "Assistant"}: ${t.content}`)
    .join("\n\n");

  const prompt = transcript
    ? `Conversation so far:\n\n${transcript}\n\nStudent: ${request.question}`
    : `Student: ${request.question}`;

  yield* streamText(prompt, {
    systemPrompt: system,
    // Low: this is comprehension support, and it should stay close to what
    // the lesson actually says rather than paraphrasing freely.
    temperature: 0.3,
    maxTokens: 800,
  });
}
