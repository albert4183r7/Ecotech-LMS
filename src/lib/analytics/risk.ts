import { db } from "@/lib/db";

const DAY_MS = 86_400_000;

export interface RiskSignals {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  courseId: string;
  courseTitle: string;
  progressPercent: number;
  minutesStudied7d: number;
  quizAverage7d: number | null;
  quizAverageAll: number | null;
  lastLoginDays: number | null;
  inactiveDays: number;
  weakestTopics: { topic: string; wrongAnswers: number }[];
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  signals: string[];
}

function daysSince(value: Date | null | undefined, now = Date.now()): number | null {
  return value ? Math.max(0, Math.floor((now - value.getTime()) / DAY_MS)) : null;
}

export async function collectRiskSignals(enrollmentId: string): Promise<RiskSignals | null> {
  const enrollment = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    include: {
      user: { select: { id: true, name: true, email: true, lastLoginAt: true } },
      course: { select: { id: true, title: true, _count: { select: { lessons: true } } } },
      progresses: { select: { completed: true, lastAccessedAt: true } },
      quizAttempts: {
        orderBy: { submittedAt: "desc" },
        select: { score: true, submittedAt: true },
      },
    },
  });
  if (!enrollment) return null;

  const weekAgo = new Date(Date.now() - 7 * DAY_MS);
  const events = await db.learningEvent.findMany({
    where: {
      userId: enrollment.userId,
      courseId: enrollment.courseId,
      createdAt: { gte: weekAgo },
    },
    select: { durationSeconds: true, createdAt: true },
  });
  const wrongAnswers = await db.studentAnswer.findMany({
    where: { isCorrect: false, attempt: { enrollmentId } },
    select: { question: { select: { quiz: { select: { lesson: { select: { title: true } } } } } } },
  });

  const completed = enrollment.progresses.filter((progress) => progress.completed).length;
  const progressPercent = enrollment.course._count.lessons
    ? Math.round((completed / enrollment.course._count.lessons) * 100)
    : 0;
  const recentAttempts = enrollment.quizAttempts.filter(
    (attempt) => attempt.submittedAt >= weekAgo,
  );
  const average = (values: number[]) =>
    values.length
      ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
      : null;
  const quizAverage7d = average(recentAttempts.map((attempt) => attempt.score));
  const quizAverageAll = average(enrollment.quizAttempts.map((attempt) => attempt.score));
  const minutesStudied7d = Math.round(
    events.reduce((sum, event) => sum + event.durationSeconds, 0) / 60,
  );

  const activityDates = [
    ...events.map((event) => event.createdAt),
    ...enrollment.progresses.map((progress) => progress.lastAccessedAt),
    ...enrollment.quizAttempts.map((attempt) => attempt.submittedAt),
    enrollment.enrolledAt,
  ];
  const lastActivity = activityDates.sort((a, b) => b.getTime() - a.getTime())[0];
  const inactiveDays = daysSince(lastActivity) ?? 0;
  const lastLoginDays = daysSince(enrollment.user.lastLoginAt);

  const topicCounts = new Map<string, number>();
  for (const answer of wrongAnswers) {
    const topic = answer.question.quiz.lesson.title;
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
  }
  const weakestTopics = [...topicCounts]
    .map(([topic, count]) => ({ topic, wrongAnswers: count }))
    .sort((a, b) => b.wrongAnswers - a.wrongAnswers)
    .slice(0, 3);

  let riskScore = 0;
  const signals: string[] = [];
  if (lastLoginDays === null || lastLoginDays >= 14) {
    riskScore += 30;
    signals.push(
      lastLoginDays === null ? "No recorded login" : `No login for ${lastLoginDays} days`,
    );
  } else if (lastLoginDays >= 7) {
    riskScore += 18;
    signals.push(`Last login was ${lastLoginDays} days ago`);
  }
  if (inactiveDays >= 10) {
    riskScore += 25;
    signals.push(`No course activity for ${inactiveDays} days`);
  } else if (inactiveDays >= 5) {
    riskScore += 12;
    signals.push(`Course activity paused for ${inactiveDays} days`);
  }
  if (quizAverage7d !== null && quizAverage7d < 50) {
    riskScore += 28;
    signals.push(`Recent quiz average is ${quizAverage7d}%`);
  } else if (quizAverage7d !== null && quizAverage7d < 70) {
    riskScore += 15;
    signals.push(`Recent quiz average is below target (${quizAverage7d}%)`);
  }
  if (minutesStudied7d === 0) {
    riskScore += 15;
    signals.push("No slide reading time in the last 7 days");
  } else if (minutesStudied7d < 20) {
    riskScore += 8;
    signals.push(`Only ${minutesStudied7d} minutes studied this week`);
  }
  const enrollmentAge = daysSince(enrollment.enrolledAt) ?? 0;
  if (enrollmentAge >= 14 && progressPercent < 25) {
    riskScore += 15;
    signals.push(`Course progress is ${progressPercent}% after ${enrollmentAge} days`);
  }
  if ((weakestTopics[0]?.wrongAnswers ?? 0) >= 3) {
    riskScore += 10;
    signals.push(`Repeated errors in ${weakestTopics[0].topic}`);
  }
  riskScore = Math.min(100, riskScore);
  const riskLevel = riskScore >= 65 ? "high" : riskScore >= 35 ? "medium" : "low";

  return {
    enrollmentId,
    studentId: enrollment.user.id,
    studentName: enrollment.user.name || enrollment.user.email,
    courseId: enrollment.course.id,
    courseTitle: enrollment.course.title,
    progressPercent,
    minutesStudied7d,
    quizAverage7d,
    quizAverageAll,
    lastLoginDays,
    inactiveDays,
    weakestTopics,
    riskScore,
    riskLevel,
    signals,
  };
}

export function defaultNarrative(signals: RiskSignals): {
  summary: string;
  recommendation: string;
} {
  const summary = signals.signals.length
    ? signals.signals.slice(0, 2).join("; ") + "."
    : "Engagement, progress, and assessment signals are currently healthy.";
  const weak = signals.weakestTopics[0]?.topic;
  const recommendation = weak
    ? `Assign a short review of “${weak}”, then ask the student to complete a Mastery Sprint.`
    : signals.minutesStudied7d < 20
      ? "Schedule a short check-in and recommend two focused 15-minute study sessions this week."
      : "Continue the current learning plan and review the next assessment result.";
  return { summary, recommendation };
}

export async function saveRiskAssessment(
  signals: RiskSignals,
  narrative = defaultNarrative(signals),
  modelKey = "transactional-risk-v1",
) {
  const previous = await db.riskAssessment.findUnique({
    where: { enrollmentId: signals.enrollmentId },
    select: { riskLevel: true },
  });
  const assessment = await db.riskAssessment.upsert({
    where: { enrollmentId: signals.enrollmentId },
    create: {
      enrollmentId: signals.enrollmentId,
      riskScore: signals.riskScore,
      riskLevel: signals.riskLevel,
      summary: narrative.summary,
      recommendation: narrative.recommendation,
      signalsJson: JSON.stringify(signals.signals),
      modelKey,
    },
    update: {
      riskScore: signals.riskScore,
      riskLevel: signals.riskLevel,
      summary: narrative.summary,
      recommendation: narrative.recommendation,
      signalsJson: JSON.stringify(signals.signals),
      modelKey,
      assessedAt: new Date(),
    },
  });

  // Alert on transition into high risk. Re-running the model does not spam the
  // same instructor or learner while the state remains high.
  if (signals.riskLevel === "high" && previous?.riskLevel !== "high") {
    const course = await db.course.findUnique({
      where: { id: signals.courseId },
      select: { creatorId: true },
    });
    const notifications: Array<{
      userId: string;
      title: string;
      message: string;
      type: string;
      link: string;
    }> = [];
    if (course?.creatorId) {
      notifications.push({
        userId: course.creatorId,
        title: `Early warning: ${signals.studentName}`,
        message: `${signals.courseTitle}: ${narrative.summary} ${narrative.recommendation}`,
        type: "warning",
        link: "/dashboard",
      });
    }
    notifications.push({
      userId: signals.studentId,
      title: "Your personalized study plan is ready",
      message: `${signals.courseTitle}: ${narrative.recommendation}`,
      type: "course",
      link: `/courses/${signals.courseId}`,
    });
    await db.notification.createMany({ data: notifications });
  }
  return assessment;
}

export async function refreshRiskSnapshot(enrollmentId: string): Promise<void> {
  const signals = await collectRiskSignals(enrollmentId);
  if (signals) await saveRiskAssessment(signals);
}
