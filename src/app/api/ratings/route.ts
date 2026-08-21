import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";
import { authFailure } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("courseId");
    // "Your rating" is the session's rating. Reading it from the query string
    // reported someone else's score as the caller's own.
    const userId = (await requireUser()).id;

    if (!courseId) {
      return NextResponse.json({ success: false, error: "courseId is required" }, { status: 400 });
    }

    const ratings = await db.rating.findMany({
      where: { courseId },
    });

    const count = ratings.length;
    const average =
      count > 0 ? Number((ratings.reduce((sum, r) => sum + r.score, 0) / count).toFixed(1)) : 0;

    const existing = await db.rating.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    const userRating: number | null = existing?.score ?? null;

    return NextResponse.json({
      success: true,
      data: { average, count, userRating },
    });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error fetching ratings:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch ratings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // The acting user is the signed-in one. Taking it from the request let a
    // caller create or change rows belonging to anybody.
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
    const { courseId, score } = body;
    const userId = actingUserId;

    if (!courseId) {
      return NextResponse.json(
        { success: false, error: "userId and courseId are required" },
        { status: 400 },
      );
    }

    if (!score || typeof score !== "number" || score < 1 || score > 5) {
      return NextResponse.json(
        { success: false, error: "Score must be an integer between 1 and 5" },
        { status: 400 },
      );
    }

    const roundedScore = Math.round(score);

    // Check if course exists
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
    }

    // Upsert rating
    const rating = await db.rating.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: { score: roundedScore },
      create: { userId, courseId, score: roundedScore },
    });

    // Recalculate average and update course
    const allRatings = await db.rating.findMany({ where: { courseId } });
    const count = allRatings.length;
    const newAverage =
      count > 0 ? Number((allRatings.reduce((sum, r) => sum + r.score, 0) / count).toFixed(1)) : 0;

    await db.course.update({
      where: { id: courseId },
      data: { rating: newAverage },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: rating.id,
        score: rating.score,
        average: newAverage,
        count,
      },
    });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error upserting rating:", error);
    return NextResponse.json({ success: false, error: "Failed to submit rating" }, { status: 500 });
  }
}
