import { streamText } from "@/lib/ai";
import { loadLessonSource, type LessonSource } from "@/lib/quiz/lesson-source";
import { db } from "@/lib/db";
import type { TutorTurn } from "./lesson-tutor";

export const MAX_COURSE_QUESTION_CHARS = 1000;
export const MAX_COURSE_HISTORY_TURNS = 10;
const MAX_COURSE_CONTEXT_CHARS = 18_000;

export interface CourseSource {
  id: string;
  title: string;
  language: string;
  lessons: LessonSource[];
}

/** Load only generated lesson content. Uploaded source files are intentionally
 * excluded: students may ask about what the course teaches, not private
 * instructor references that were never published as lessons. */
export async function loadCourseSource(courseId: string): Promise<CourseSource | null> {
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      title: true,
      language: true,
      lessons: { orderBy: { order: "asc" }, select: { id: true } },
    },
  });
  if (!course) return null;

  const sources = await Promise.all(course.lessons.map((lesson) => loadLessonSource(lesson.id)));
  return {
    id: course.id,
    title: course.title,
    language: course.language,
    lessons: sources.filter((source): source is LessonSource => source !== null),
  };
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length >= 3),
  );
}

/** Retrieval is deterministic and visible in the answer context. It favors
 * slides sharing the question's vocabulary, then fills remaining space in
 * course order so broad prompts such as "summarize this course" still work. */
export function buildCourseContext(source: CourseSource, question: string): string {
  const queryTerms = terms(question);
  const chunks = source.lessons.flatMap((lesson, lessonIndex) =>
    lesson.slides.map((slide) => {
      const text = `LESSON ${lessonIndex + 1}: ${lesson.lessonTitle}\nSLIDE ${slide.number}: ${slide.title}\n${slide.text}`;
      const haystack = terms(text);
      let score = 0;
      for (const term of queryTerms) if (haystack.has(term)) score++;
      return { text, score, lessonIndex, slideNumber: slide.number };
    }),
  );

  chunks.sort(
    (a, b) => b.score - a.score || a.lessonIndex - b.lessonIndex || a.slideNumber - b.slideNumber,
  );
  const kept: typeof chunks = [];
  let used = 0;
  for (const chunk of chunks) {
    if (kept.length > 0 && used + chunk.text.length > MAX_COURSE_CONTEXT_CHARS) continue;
    kept.push(chunk);
    used += chunk.text.length;
  }
  kept.sort((a, b) => a.lessonIndex - b.lessonIndex || a.slideNumber - b.slideNumber);
  return kept.map((chunk) => chunk.text).join("\n\n---\n\n");
}

export async function* answerCourseQuestion(request: {
  source: CourseSource;
  question: string;
  history: TutorTurn[];
}): AsyncGenerator<string, void, undefined> {
  const context = buildCourseContext(request.source, request.question);
  const transcript = request.history
    .slice(-MAX_COURSE_HISTORY_TURNS)
    .map((turn) => `${turn.role === "user" ? "Student" : "Assistant"}: ${turn.content}`)
    .join("\n\n");

  const systemPrompt = `You are the AI assistant for the complete course "${request.source.title}".

Answer only from the published lesson excerpts below. You may connect ideas across lessons and tell the learner which lesson or slide to revisit. Never use outside knowledge or invent material. If the course does not cover the answer, say so plainly. Be concise, supportive, and practical. Use ${request.source.language}. Plain text only.

COURSE KNOWLEDGE BASE
=====================
${context}
=====================`;
  const prompt = transcript
    ? `Conversation so far:\n${transcript}\n\nStudent: ${request.question}`
    : `Student: ${request.question}`;

  yield* streamText(prompt, {
    task: "course-tutor",
    systemPrompt,
    temperature: 0.3,
    maxTokens: 900,
  });
}
