import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fail, handleRoute, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/session";
import { loadCourseSource, type CourseSource } from "@/lib/assistant/course-tutor";
import { generateMasteryBatch, questionFingerprint } from "@/lib/mastery/generate";
import { AI_GENERATION_RULE, consumeAuthenticatedRequest } from "@/lib/rate-limit";

const MAX_SELECTED_COURSES = 8;
const GENERATION_COURSES_PER_REFILL = 4;
const QUESTIONS_PER_COURSE = 2;

function parseOptions(value: string): string[] {
  try {
    const options = JSON.parse(value);
    return Array.isArray(options) && options.every((option) => typeof option === "string")
      ? options
      : [];
  } catch {
    return [];
  }
}

function normalizeCourseIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))),
  ].slice(0, MAX_SELECTED_COURSES);
}

async function requireSelectedEnrollments(userId: string, courseIds: string[]) {
  if (courseIds.length === 0) return null;
  const enrolled = await db.enrollment.findMany({
    where: {
      userId,
      courseId: { in: courseIds },
      status: { not: "dropped" },
      course: { status: "published" },
    },
    select: { courseId: true, course: { select: { title: true } } },
  });
  if (enrolled.length !== courseIds.length) return null;
  return new Map(enrolled.map((item) => [item.courseId, item.course.title]));
}

async function sprintStats(userId: string, courseIds: string[]) {
  const courseFilter = { in: courseIds };
  const [answered, correct, mastered, generated] = await Promise.all([
    db.masteryResponse.count({ where: { question: { userId, courseId: courseFilter } } }),
    db.masteryResponse.count({
      where: { isCorrect: true, question: { userId, courseId: courseFilter } },
    }),
    db.masteryQuestion.count({ where: { userId, courseId: courseFilter, mastered: true } }),
    db.masteryQuestion.count({ where: { userId, courseId: courseFilter } }),
  ]);
  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    mastered,
    generated,
  };
}

async function selectNext(userId: string, courseIds: string[]) {
  const recent = await db.masteryResponse.findMany({
    where: { question: { userId, courseId: { in: courseIds } } },
    orderBy: { answeredAt: "desc" },
    take: 4,
    select: { questionId: true, question: { select: { courseId: true } } },
  });
  const recentIds = new Set(recent.map((response) => response.questionId));
  const candidates = await db.masteryQuestion.findMany({
    where: { userId, courseId: { in: courseIds }, mastered: false },
    orderBy: { createdAt: "asc" },
    include: { course: { select: { title: true } } },
  });
  const fresh = candidates.filter((question) => question.timesShown === 0);
  const retry = candidates.filter(
    (question) => question.wrongCount > 0 && !recentIds.has(question.id),
  );
  let pool = retry.length > 0 && (fresh.length === 0 || Math.random() < 0.35) ? retry : fresh;
  if (pool.length === 0) return null;

  // Avoid serving the same course twice in a row when another selected course
  // has a ready question. Topic mixing should be visible, not merely possible.
  const lastCourseId = recent[0]?.question.courseId;
  const otherCourses = pool.filter((question) => question.courseId !== lastCourseId);
  if (otherCourses.length > 0) pool = otherCourses;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function uncoveredCourses(userId: string, courseIds: string[]): Promise<string[]> {
  const covered = await db.masteryQuestion.groupBy({
    by: ["courseId"],
    where: { userId, courseId: { in: courseIds }, mastered: false },
  });
  const coveredIds = new Set(covered.map((row) => row.courseId));
  return courseIds.filter((courseId) => !coveredIds.has(courseId));
}

function chooseLesson(source: CourseSource, weakCounts: Map<string, number>) {
  const ranked = [...source.lessons].sort(
    (a, b) => (weakCounts.get(b.lessonId) ?? 0) - (weakCounts.get(a.lessonId) ?? 0),
  );
  const topWeight = weakCounts.get(ranked[0]?.lessonId ?? "") ?? 0;
  return topWeight > 0 && Math.random() < 0.65
    ? ranked[0]
    : source.lessons[Math.floor(Math.random() * source.lessons.length)];
}

async function generateMixedReserve(request: NextRequest, userId: string, courseIds: string[]) {
  const limited = consumeAuthenticatedRequest(
    request.headers,
    userId,
    "ai:mastery-sprint",
    AI_GENERATION_RULE,
  );
  if (!limited.allowed) throw new Error(`RATE_LIMIT:${limited.retryAfterSeconds}`);

  const [loaded, prior, wrongFormal, counts] = await Promise.all([
    Promise.all(courseIds.map((courseId) => loadCourseSource(courseId))),
    db.masteryQuestion.findMany({
      where: { userId, courseId: { in: courseIds } },
      select: { courseId: true, prompt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.studentAnswer.findMany({
      where: {
        isCorrect: false,
        attempt: { userId, quiz: { lesson: { courseId: { in: courseIds } } } },
      },
      select: {
        question: {
          select: { quiz: { select: { lesson: { select: { id: true, courseId: true } } } } },
        },
      },
    }),
    db.masteryQuestion.groupBy({
      by: ["courseId"],
      where: { userId, courseId: { in: courseIds } },
      _count: { _all: true },
    }),
  ]);

  const sources = loaded.filter((source): source is CourseSource =>
    Boolean(source && source.lessons.length),
  );
  if (sources.length === 0) throw new Error("NO_CONTENT");

  const generatedByCourse = new Map(counts.map((row) => [row.courseId, row._count._all]));
  const chosenSources = sources
    .map((source) => ({ source, count: generatedByCourse.get(source.id) ?? 0, tie: Math.random() }))
    .sort((a, b) => a.count - b.count || a.tie - b.tie)
    .slice(0, GENERATION_COURSES_PER_REFILL)
    .map((item) => item.source);

  const weakByCourse = new Map<string, Map<string, number>>();
  for (const answer of wrongFormal) {
    const lesson = answer.question.quiz.lesson;
    const courseWeakness = weakByCourse.get(lesson.courseId) ?? new Map<string, number>();
    courseWeakness.set(lesson.id, (courseWeakness.get(lesson.id) ?? 0) + 1);
    weakByCourse.set(lesson.courseId, courseWeakness);
  }

  const generated = await Promise.all(
    chosenSources.map(async (source) => {
      const sourceLesson = chooseLesson(source, weakByCourse.get(source.id) ?? new Map());
      const avoided = prior
        .filter((question) => question.courseId === source.id)
        .map((question) => question.prompt);
      const questions = await generateMasteryBatch(sourceLesson, avoided, QUESTIONS_PER_COURSE);
      return { source, sourceLesson, questions };
    }),
  );

  await Promise.all(
    generated.flatMap(({ source, sourceLesson, questions }) =>
      questions.map(async (question) => {
        const correctOptionIndex = question.options.findIndex((option) => option.isCorrect);
        if (correctOptionIndex < 0) return;
        await db.masteryQuestion
          .create({
            data: {
              userId,
              courseId: source.id,
              lessonId: sourceLesson.lessonId,
              prompt: question.prompt,
              optionsJson: JSON.stringify(question.options.map((option) => option.text)),
              correctOptionIndex,
              explanation: question.explanation ?? null,
              sourceQuote: question.sourceQuote,
              topic: sourceLesson.lessonTitle,
              fingerprint: questionFingerprint(question.prompt),
            },
          })
          .catch((error: unknown) => {
            if ((error as { code?: string })?.code !== "P2002") throw error;
          });
      }),
    ),
  );
}

function idsFromQuery(request: NextRequest): string[] {
  return normalizeCourseIds(request.nextUrl.searchParams.getAll("courseId"));
}

export async function GET(request: NextRequest) {
  return handleRoute("mastery-sprint.multi.GET", async () => {
    const user = await requireUser();
    if (user.role !== "student") return fail("Mastery Sprint is for students only.", 403);
    const courseIds = idsFromQuery(request);
    if (!(await requireSelectedEnrollments(user.id, courseIds))) {
      return fail("Select one or more courses you are enrolled in.", 403);
    }
    return ok(await sprintStats(user.id, courseIds));
  });
}

export async function POST(request: NextRequest) {
  return handleRoute("mastery-sprint.multi.POST", async () => {
    const user = await requireUser();
    if (user.role !== "student") return fail("Mastery Sprint is for students only.", 403);
    const body = (await request.json().catch(() => null)) as {
      action?: "next" | "answer";
      courseIds?: unknown;
      questionId?: string;
      selectedOptionIndex?: number;
    } | null;
    const courseIds = normalizeCourseIds(body?.courseIds);
    const courseTitles = await requireSelectedEnrollments(user.id, courseIds);
    if (!courseTitles) return fail("Select one or more courses you are enrolled in.", 403);

    if (body?.action === "answer") {
      if (!body.questionId || !Number.isInteger(body.selectedOptionIndex)) {
        return fail("questionId and selectedOptionIndex are required.", 400);
      }
      const question = await db.masteryQuestion.findFirst({
        where: { id: body.questionId, userId: user.id, courseId: { in: courseIds } },
      });
      if (!question) return fail("Practice question not found in this sprint.", 404);
      const options = parseOptions(question.optionsJson);
      const selected = body.selectedOptionIndex as number;
      if (selected < 0 || selected >= options.length) return fail("Invalid answer option.", 400);
      const isCorrect = selected === question.correctOptionIndex;
      await db.$transaction([
        db.masteryResponse.create({
          data: { questionId: question.id, selectedOptionIndex: selected, isCorrect },
        }),
        db.masteryQuestion.update({
          where: { id: question.id },
          data: isCorrect ? { mastered: true } : { mastered: false, wrongCount: { increment: 1 } },
        }),
        db.learningEvent.create({
          data: {
            type: "MASTERY_ANSWER",
            userId: user.id,
            courseId: question.courseId,
            lessonId: question.lessonId,
            metadata: JSON.stringify({
              topic: question.topic,
              isCorrect,
              sprintCourseIds: courseIds,
            }),
          },
        }),
      ]);
      return ok({
        isCorrect,
        correctOptionIndex: question.correctOptionIndex,
        explanation: question.explanation,
        sourceQuote: question.sourceQuote,
        stats: await sprintStats(user.id, courseIds),
      });
    }

    if (body?.action !== "next") return fail("action must be next or answer.", 400);
    // A legacy single-course reserve must not dominate a newly mixed sprint.
    // Seed uncovered selections before choosing so several courses can appear
    // from the first few questions, instead of only after one backlog drains.
    const uncovered = courseIds.length > 1 ? await uncoveredCourses(user.id, courseIds) : [];
    let refillAttempted = false;
    let refillError = "";
    if (uncovered.length > 0) {
      refillAttempted = true;
      try {
        await generateMixedReserve(request, user.id, uncovered);
      } catch (error) {
        refillError = error instanceof Error ? error.message : "";
      }
    }

    let question = await selectNext(user.id, courseIds);
    if (!question && !refillAttempted) {
      try {
        await generateMixedReserve(request, user.id, courseIds);
      } catch (error) {
        refillError = error instanceof Error ? error.message : "";
      }
      question = await selectNext(user.id, courseIds);
    }
    if (!question && refillError.startsWith("RATE_LIMIT:")) {
      return fail("Practice generation limit reached. Please try again later.", 429);
    }
    if (!question && refillError === "NO_CONTENT") {
      return fail("Finish generating lessons first.", 409);
    }
    if (!question && refillError) throw new Error(refillError);
    if (!question) return fail("No new grounded practice question could be generated.", 502);

    await db.masteryQuestion.update({
      where: { id: question.id },
      data: { timesShown: { increment: 1 }, lastShownAt: new Date() },
    });
    return ok({
      id: question.id,
      prompt: question.prompt,
      options: parseOptions(question.optionsJson),
      topic: question.topic,
      courseId: question.courseId,
      courseTitle: question.course.title ?? courseTitles.get(question.courseId) ?? "Course",
      isRetry: question.wrongCount > 0,
      stats: await sprintStats(user.id, courseIds),
    });
  });
}
