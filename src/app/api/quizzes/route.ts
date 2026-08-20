import { db } from "@/lib/db";
import { handleRoute, ok } from "@/lib/api-response";
import { requireUser } from "@/lib/session";

// ============================================
// GET /api/quizzes
//
// The quizzes available to the signed-in student: those belonging to lessons
// of published courses they are enrolled in, and nothing else. The filter is
// the query, not a check applied afterwards, so an unenrolled or unpublished
// course's quiz is never in the result set to begin with.
//
// Instructors get the quizzes of the courses they created, so the same page
// serves as their overview.
// ============================================

export async function GET() {
  return handleRoute("quizzes.GET", async () => {
    const user = await requireUser();

    const [enrollments, ownedCourses] = await Promise.all([
      db.enrollment.findMany({
        where: { userId: user.id, course: { status: "published" } },
        select: { id: true, courseId: true },
      }),
      db.course.findMany({ where: { creatorId: user.id }, select: { id: true } }),
    ]);

    const enrolledCourseIds = enrollments.map((e) => e.courseId);
    const ownedCourseIds = ownedCourses.map((c) => c.id);
    const visibleCourseIds = [...new Set([...enrolledCourseIds, ...ownedCourseIds])];

    if (visibleCourseIds.length === 0) return ok([]);

    const quizzes = await db.quiz.findMany({
      where: {
        status: "READY",
        lesson: { courseId: { in: visibleCourseIds } },
      },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            order: true,
            course: { select: { id: true, title: true, coverImage: true, status: true } },
          },
        },
        _count: { select: { questions: true } },
        attempts: {
          where: { userId: user.id },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: {
            id: true,
            score: true,
            correctCount: true,
            totalCount: true,
            submittedAt: true,
          },
        },
      },
      orderBy: [{ lesson: { courseId: "asc" } }, { lesson: { order: "asc" } }],
    });

    const ownedSet = new Set(ownedCourseIds);
    return ok(
      quizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        questionCount: quiz._count.questions,
        lesson: { id: quiz.lesson.id, title: quiz.lesson.title, order: quiz.lesson.order },
        course: {
          id: quiz.lesson.course.id,
          title: quiz.lesson.course.title,
          coverImage: quiz.lesson.course.coverImage,
        },
        /** Distinguishes "yours to review" from "yours to sit". */
        isOwner: ownedSet.has(quiz.lesson.course.id),
        lastAttempt: quiz.attempts[0] ?? null,
      })),
    );
  });
}
