import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('courseId');
    const userId = searchParams.get('userId');

    if (!courseId) {
      return NextResponse.json(
        { success: false, error: 'courseId is required' },
        { status: 400 }
      );
    }

    const ratings = await db.rating.findMany({
      where: { courseId },
    });

    const count = ratings.length;
    const average =
      count > 0
        ? Number((ratings.reduce((sum, r) => sum + r.score, 0) / count).toFixed(1))
        : 0;

    let userRating: number | null = null;
    if (userId) {
      const existing = await db.rating.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (existing) {
        userRating = existing.score;
      }
    }

    return NextResponse.json({
      success: true,
      data: { average, count, userRating },
    });
  } catch (error) {
    console.error('Error fetching ratings:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch ratings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, courseId, score } = body;

    if (!userId || !courseId) {
      return NextResponse.json(
        { success: false, error: 'userId and courseId are required' },
        { status: 400 }
      );
    }

    if (!score || typeof score !== 'number' || score < 1 || score > 5) {
      return NextResponse.json(
        { success: false, error: 'Score must be an integer between 1 and 5' },
        { status: 400 }
      );
    }

    const roundedScore = Math.round(score);

    // Check if course exists
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
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
      count > 0
        ? Number(
            (allRatings.reduce((sum, r) => sum + r.score, 0) / count).toFixed(1)
          )
        : 0;

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
    console.error('Error upserting rating:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit rating' },
      { status: 500 }
    );
  }
}
