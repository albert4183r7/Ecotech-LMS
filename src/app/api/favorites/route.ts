import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";
import { authFailure } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    // Your own favourites. The id used to come from the query string with no
    // check at all, so any caller could read anyone's saved courses.
    const userId = (await requireUser()).id;

    const favorites = await db.favorite.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            category: true,
            _count: {
              select: {
                lessons: true,
                enrollments: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedFavorites = favorites.map((favorite) => ({
      id: favorite.id,
      createdAt: favorite.createdAt,
      course: {
        id: favorite.course.id,
        title: favorite.course.title,
        description: favorite.course.description,
        coverImage: favorite.course.coverImage,
        rating: favorite.course.rating,
        studentCount: favorite.course.studentCount,
        language: favorite.course.language,
        category: favorite.course.category
          ? {
              id: favorite.course.category.id,
              name: favorite.course.category.name,
              color: favorite.course.category.color,
            }
          : null,
        lessonsCount: favorite.course._count.lessons,
        enrollmentsCount: favorite.course._count.enrollments,
      },
    }));

    return NextResponse.json({ success: true, data: formattedFavorites });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error fetching favorites:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch favorites" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // The acting user is the signed-in one. Taking it from the request let a
    // caller write rows belonging to anybody.
    let actingUserId: string;
    try {
      actingUserId = (await requireUser()).id;
    } catch (error) {
      const denied = authFailure(error);
      if (denied) return denied;
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const body = await request.json();
    const { courseId } = body;
    const userId = actingUserId;

    if (!userId || !courseId) {
      return NextResponse.json(
        { success: false, error: "userId and courseId are required" },
        { status: 400 },
      );
    }

    // Check if course exists
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
    }

    // Check if already favorited
    const existing = await db.favorite.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
    });

    if (existing) {
      // Unfavorite
      await db.favorite.delete({ where: { id: existing.id } });
      return NextResponse.json({
        success: true,
        data: { favorited: false },
      });
    }

    // Favorite
    const favorite = await db.favorite.create({
      data: { userId, courseId },
    });

    return NextResponse.json(
      { success: true, data: { favorited: true, id: favorite.id } },
      { status: 201 },
    );
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error toggling favorite:", error);
    return NextResponse.json(
      { success: false, error: "Failed to toggle favorite" },
      { status: 500 },
    );
  }
}
