// Focused database regression checks for invariants that static slide checks
// cannot exercise. Everything runs in a disposable SQLite database.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, copyFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const temp = await mkdtemp(path.join(root, ".integrity-check-"));
const databasePath = path.join(temp, "check.db");
process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;
process.env.NODE_ENV = "production";

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");

try {
  // Local development already has the schema in its ignored SQLite database;
  // copying it avoids mutating that data and also works around Prisma 6's
  // schema-engine incompatibility with Node 24 on Windows. A clean CI checkout
  // has no ignored database, so it initializes the disposable one normally.
  const developmentDb = path.join(root, "db", "custom.db");
  try {
    await access(developmentDb);
    await copyFile(developmentDb, databasePath);
  } catch {
    execFileSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
      cwd: root,
      env: process.env,
      stdio: "pipe",
    });
  }

  const { db } = await import("../src/lib/db");
  const { saveGeneratedQuiz } = await import("../src/lib/quiz/persist");
  const { appendManualQuestion } = await import("../src/lib/quiz/questions");

  const user = await db.user.create({
    data: { email: "integrity@example.test", password: "unused", role: "student" },
  });
  const course = await db.course.create({ data: { title: "Integrity", status: "published" } });
  const lesson = await db.lesson.create({
    data: { title: "Lesson", courseId: course.id, order: 0 },
  });
  const enrollment = await db.enrollment.create({
    data: { userId: user.id, courseId: course.id },
  });
  const quiz = await db.quiz.create({
    data: {
      lessonId: lesson.id,
      title: "Original",
      status: "READY",
      questions: {
        create: {
          prompt: "Original question?",
          order: 0,
          options: {
            create: [
              { text: "Correct", isCorrect: true, order: 0 },
              { text: "Wrong", isCorrect: false, order: 1 },
            ],
          },
        },
      },
    },
    include: { questions: { include: { options: true } } },
  });
  const question = quiz.questions[0];
  const correct = question.options.find((option) => option.isCorrect)!;
  const attempt = await db.quizAttempt.create({
    data: {
      quizId: quiz.id,
      userId: user.id,
      enrollmentId: enrollment.id,
      score: 90,
      correctCount: 9,
      totalCount: 10,
      answers: {
        create: {
          questionId: question.id,
          selectedOptionId: correct.id,
          isCorrect: true,
        },
      },
    },
  });

  const savedQuizId = await saveGeneratedQuiz(lesson.id, {
    title: "Regenerated",
    questions: [
      {
        prompt: "Replacement question?",
        sourceQuote: "Replacement source",
        options: [
          { text: "New correct", isCorrect: true },
          { text: "New wrong", isCorrect: false },
        ],
      },
    ],
  });

  assert.equal(savedQuizId, quiz.id, "quiz identity changed during regeneration");
  const preserved = await db.quizAttempt.findUnique({ where: { id: attempt.id } });
  assert.ok(preserved, "quiz attempt was deleted during regeneration");
  assert.equal(preserved.score, 90, "stored score changed during regeneration");
  assert.equal(await db.studentAnswer.count({ where: { attemptId: attempt.id } }), 0);
  assert.equal(await db.question.count({ where: { quizId: quiz.id } }), 1);

  const manualQuestion = (number: number) => ({
    prompt: `Concurrent manual question number ${number}?`,
    options: [
      { text: `Correct ${number}`, isCorrect: true },
      { text: `Wrong ${number}`, isCorrect: false },
    ],
  });
  await Promise.all([
    appendManualQuestion(quiz.id, manualQuestion(1)),
    appendManualQuestion(quiz.id, manualQuestion(2)),
  ]);
  const ordered = await db.question.findMany({
    where: { quizId: quiz.id },
    orderBy: { order: "asc" },
    select: { order: true },
  });
  assert.deepEqual(
    ordered.map((row) => row.order),
    [0, 1, 2],
    "concurrent question inserts did not receive distinct contiguous orders",
  );

  await db.$disconnect();
  console.log("  ok   quiz regeneration preserves attempt identity and score");
  console.log("  ok   concurrent manual questions receive distinct orders");
} finally {
  await rm(temp, { recursive: true, force: true });
}
