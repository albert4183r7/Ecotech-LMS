import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const course = await db.course.findUnique({
      where: { id },
      include: {
        category: true,
        creator: {
          select: { id: true, name: true, email: true, avatar: true, department: true },
        },
        sections: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: {
            enrollments: true,
            favorites: true,
          },
        },
      },
    });

    if (!course) {
      return NextResponse.json(
        { success: false, error: 'Course not found' },
        { status: 404 }
      );
    }

    // Check if user is enrolled
    let isEnrolled = false;
    let enrollment = null;
    if (userId) {
      enrollment = await db.enrollment.findUnique({
        where: {
          userId_courseId: { userId, courseId: id },
        },
      });
      isEnrolled = !!enrollment;
    }

    // Check if user has favorited
    let isFavorited = false;
    if (userId) {
      const favorite = await db.favorite.findUnique({
        where: {
          userId_courseId: { userId, courseId: id },
        },
      });
      isFavorited = !!favorite;
    }

    const formattedCourse = {
      id: course.id,
      title: course.title,
      description: course.description,
      coverImage: course.coverImage,
      rating: course.rating,
      studentCount: course.studentCount,
      status: course.status,
      language: course.language,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      category: course.category
        ? {
            id: course.category.id,
            name: course.category.name,
            description: course.category.description,
            color: course.category.color,
          }
        : null,
      creator: course.creator || null,
      sections: course.sections.map((section) => ({
        id: section.id,
        title: section.title,
        order: section.order,
        totalPages: section.totalPages,
        createdAt: section.createdAt,
        updatedAt: section.updatedAt,
      })),
      enrollmentsCount: course._count.enrollments,
      favoritesCount: course._count.favorites,
      isEnrolled,
      isFavorited,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            status: enrollment.status,
            enrolledAt: enrollment.enrolledAt,
            completedAt: enrollment.completedAt,
          }
        : null,
    };

    return NextResponse.json({ success: true, data: formattedCourse });
  } catch (error) {
    console.error('Error fetching course:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch course' },
      { status: 500 }
    );
  }
}
