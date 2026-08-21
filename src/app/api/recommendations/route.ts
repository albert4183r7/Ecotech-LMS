import { NextRequest, NextResponse } from "next/server";
import { authFailure } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RecommendedCourse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  studentCount: number;
  categoryName: string | null;
  categoryColor: string | null;
  reason: string;
}

interface RecommendationsResponse {
  success: boolean;
  data: RecommendedCourse[];
}

/* ------------------------------------------------------------------ */
/*  GET /api/recommendations?userId=xxx                                */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    // Whose data this is comes from the session, never from the query string:
    // the id used to default to a seeded account, so every signed-in user saw
    // that account's numbers, and anyone could read another user's by asking.
    const userId = (await requireUser()).id;

    // Get user's enrolled course IDs and their categories
    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: { category: true },
        },
      },
    });

    const enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));

    // Collect categories the user is interested in
    const enrolledCategoryIds = new Set<string>();
    const completedCourseTitles: string[] = [];

    for (const enrollment of enrollments) {
      if (enrollment.course.categoryId) {
        enrolledCategoryIds.add(enrollment.course.categoryId);
      }
      if (enrollment.status === "completed") {
        completedCourseTitles.push(enrollment.course.title);
      }
    }

    let recommendations: RecommendedCourse[] = [];

    // Strategy 1: Find courses in the same categories the user is enrolled in
    if (enrolledCategoryIds.size > 0) {
      const categoryCourses = await db.course.findMany({
        where: {
          status: "published",
          categoryId: { in: Array.from(enrolledCategoryIds) },
          id: { notIn: Array.from(enrolledCourseIds) },
        },
        include: { category: true },
        orderBy: { rating: "desc" },
        take: 8,
      });

      // Find the course title that triggered the category recommendation
      for (const course of categoryCourses) {
        const relatedEnrollment = enrollments.find(
          (e) => e.course.categoryId === course.categoryId,
        );
        const reason = relatedEnrollment
          ? `Because you enrolled in "${relatedEnrollment.course.title}"`
          : "Popular in your field";

        recommendations.push({
          id: course.id,
          title: course.title,
          description: course.description,
          coverImage: course.coverImage,
          rating: course.rating,
          studentCount: course.studentCount,
          categoryName: course.category?.name || null,
          categoryColor: course.category?.color || null,
          reason,
        });
      }
    }

    // Strategy 2: If completed a course, recommend "Next Steps" in the same category
    if (completedCourseTitles.length > 0) {
      // flatMap rather than filter+map so the nulls are gone from the type as
      // well as the values; `categoryId: { in: (string | null)[] }` does not
      // typecheck, and the resulting error cost this query its `category`.
      const completedCategories = enrollments.flatMap((e) =>
        e.status === "completed" && e.course.categoryId ? [e.course.categoryId] : [],
      );

      const nextStepCourses = await db.course.findMany({
        where: {
          status: "published",
          categoryId: { in: [...new Set(completedCategories)] },
          id: { notIn: Array.from(enrolledCourseIds) },
        },
        include: { category: true },
        orderBy: { studentCount: "desc" },
        take: 6,
      });

      for (const course of nextStepCourses) {
        // Avoid duplicates
        if (recommendations.find((r) => r.id === course.id)) continue;

        recommendations.push({
          id: course.id,
          title: course.title,
          description: course.description,
          coverImage: course.coverImage,
          rating: course.rating,
          studentCount: course.studentCount,
          categoryName: course.category?.name || null,
          categoryColor: course.category?.color || null,
          reason: "Next step in your learning path",
        });
      }
    }

    // Strategy 3: If no enrollments, show highest-rated courses
    if (enrollments.length === 0) {
      const topCourses = await db.course.findMany({
        where: { status: "published" },
        include: { category: true },
        orderBy: { rating: "desc" },
        take: 4,
      });

      recommendations = topCourses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        coverImage: course.coverImage,
        rating: course.rating,
        studentCount: course.studentCount,
        categoryName: course.category?.name || null,
        categoryColor: course.category?.color || null,
        reason: "Highly rated by learners",
      }));
    }

    // Fallback: if still empty, get top courses
    if (recommendations.length === 0) {
      const fallbackCourses = await db.course.findMany({
        where: { status: "published" },
        include: { category: true },
        orderBy: { rating: "desc" },
        take: 4,
      });

      recommendations = fallbackCourses.map((course) => ({
        id: course.id,
        title: course.title,
        description: course.description,
        coverImage: course.coverImage,
        rating: course.rating,
        studentCount: course.studentCount,
        categoryName: course.category?.name || null,
        categoryColor: course.category?.color || null,
        reason: "Popular choice",
      }));
    }

    // Deduplicate and take top 4
    const seen = new Set<string>();
    const deduped = recommendations.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    const response: RecommendationsResponse = {
      success: true,
      data: deduped.slice(0, 4),
    };

    return NextResponse.json(response);
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("[Recommendations API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to load recommendations" },
      { status: 500 },
    );
  }
}
