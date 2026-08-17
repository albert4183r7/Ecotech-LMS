import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const sortBy = searchParams.get('sortBy') || 'newest';
    const timeRange = searchParams.get('timeRange');
    const search = searchParams.get('search');
    const tab = searchParams.get('tab');

    // Build where clause
    const where: Record<string, unknown> = { status: 'published' };

    if (category) {
      where.categoryId = category;
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    if (timeRange) {
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0);
      }
      where.createdAt = { gte: startDate };
    }

    // Build orderBy clause
    let orderBy: Record<string, string> = { createdAt: 'desc' };

    switch (sortBy) {
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'most_students':
        orderBy = { studentCount: 'desc' };
        break;
      case 'alphabetical':
        orderBy = { title: 'asc' };
        break;
      case 'rating':
        orderBy = { rating: 'desc' };
        break;
    }

    // Handle tab-based queries
    if (tab === 'hot') {
      orderBy = { studentCount: 'desc' };
    } else if (tab === 'new') {
      orderBy = { createdAt: 'desc' };
    } else if (tab === 'recommended') {
      orderBy = { rating: 'desc' };
    }

    const courses = await db.course.findMany({
      where,
      orderBy,
      include: {
        category: true,
        _count: {
          select: {
            sections: true,
            enrollments: true,
          },
        },
      },
    });

    const formattedCourses = courses.map((course) => ({
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
      sectionsCount: course._count.sections,
      enrollmentsCount: course._count.enrollments,
    }));

    return NextResponse.json({ success: true, data: formattedCourses });
  } catch (error) {
    console.error('Error fetching courses:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch courses' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      categoryId,
      language,
      creatorId,
      coverImage,
      sections,
    } = body;

    if (!title || !creatorId) {
      return NextResponse.json(
        { success: false, error: 'Title and creatorId are required' },
        { status: 400 }
      );
    }

    const course = await db.course.create({
      data: {
        title,
        description: description || null,
        categoryId: categoryId || null,
        language: language || 'english',
        creatorId,
        coverImage: coverImage || null,
        status: 'draft',
        sections: sections
          ? {
              create: sections.map(
                (
                  sec: { title: string; content: string; totalPages: number },
                  index: number
                ) => ({
                  title: sec.title,
                  content: sec.content
                    ? typeof sec.content === 'string'
                      ? sec.content
                      : JSON.stringify(sec.content)
                    : null,
                  totalPages: sec.totalPages || 0,
                  order: index,
                })
              ),
            }
          : undefined,
      },
      include: {
        category: true,
        creator: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        sections: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return NextResponse.json({ success: true, data: course }, { status: 201 });
  } catch (error) {
    console.error('Error creating course:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create course' },
      { status: 500 }
    );
  }
}
