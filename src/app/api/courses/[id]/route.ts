import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    const course = await db.course.findUnique({
      where: { id },
      include: {
        category: true,
        creator: {
          select: { id: true, name: true, email: true, avatar: true, department: true },
        },
        lessons: {
          orderBy: { order: "asc" },
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
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
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
      lessons: course.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        order: lesson.order,
        outlineJson: lesson.outlineJson,
        courseId: lesson.courseId,
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
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
    console.error("Error fetching course:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch course" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, description, categoryId, language, coverImage, status } = body;

    const course = await db.course.findUnique({ where: { id } });
    if (!course) {
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
    }

    const updated = await db.course.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(categoryId !== undefined && { categoryId }),
        ...(language !== undefined && { language }),
        ...(coverImage !== undefined && { coverImage }),
        ...(status !== undefined && { status }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating course:", error);
    return NextResponse.json({ success: false, error: "Failed to update course" }, { status: 500 });
  }
}
