import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const enrollments = await db.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            category: true,
            _count: {
              select: { lessons: true },
            },
          },
        },
        progresses: {
          include: {
            lesson: {
              select: { id: true, title: true },
            },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    const formattedEnrollments = enrollments.map((enrollment) => {
      const totalLessons = enrollment.course._count.lessons;
      const completedLessons = enrollment.progresses.filter(
        (p) => p.completed
      ).length;
      const totalProgress =
        totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0;

      return {
        id: enrollment.id,
        status: enrollment.status,
        enrolledAt: enrollment.enrolledAt,
        completedAt: enrollment.completedAt,
        progress: totalProgress,
        course: {
          id: enrollment.course.id,
          title: enrollment.course.title,
          description: enrollment.course.description,
          coverImage: enrollment.course.coverImage,
          rating: enrollment.course.rating,
          language: enrollment.course.language,
          category: enrollment.course.category
            ? {
                id: enrollment.course.category.id,
                name: enrollment.course.category.name,
                color: enrollment.course.category.color,
              }
            : null,
          lessonsCount: enrollment.course._count.lessons,
        },
      };
    });

    return NextResponse.json({ success: true, data: formattedEnrollments });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch enrollments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, courseId } = body;

    if (!userId || !courseId) {
      return NextResponse.json(
        { success: false, error: 'userId and courseId are required' },
        { status: 400 }
      );
    }

    // Check if course exists
    const course = await db.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    // Check if already enrolled
    const existing = await db.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Already enrolled in this course' },
        { status: 409 }
      );
    }

    // Create enrollment
    const enrollment = await db.enrollment.create({
      data: {
        userId,
        courseId,
        status: 'in_progress',
      },
      include: {
        course: {
          include: {
            category: true,
            _count: {
              select: { lessons: true },
            },
          },
        },
      },
    });

    // Increment student count on course
    await db.course.update({
      where: { id: courseId },
      data: { studentCount: { increment: 1 } },
    });

    return NextResponse.json({ success: true, data: enrollment }, { status: 201 });
  } catch (error) {
    console.error('Error creating enrollment:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to enroll in course' },
      { status: 500 }
    );
  }
}
