import { NextRequest, NextResponse } from "next/server";
import { authFailure } from "@/lib/api-response";
import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const sortBy = searchParams.get("sortBy") || "newest";
    const timeRange = searchParams.get("timeRange");
    const search = searchParams.get("search");
    const tab = searchParams.get("tab");
    const creatorId = searchParams.get("creatorId");

    // Build where clause
    const where: Record<string, unknown> = {};

    const user = await requireUser();

    // The instructor dashboard lists its own courses in every status, drafts
    // included. Asking for someone else's creatorId used to return their
    // drafts too, so anyone could read another instructor's unpublished work
    // by naming them; other people's courses are now published-only.
    if (creatorId) {
      where.creatorId = creatorId;
      if (creatorId !== user.id || user.role !== "instructor") where.status = "published";
    } else {
      where.status = "published";
    }

    if (category) {
      where.categoryId = category;
    }

    if (search) {
      where.OR = [{ title: { contains: search } }, { description: { contains: search } }];
    }

    if (timeRange) {
      const now = new Date();
      let startDate: Date;

      switch (timeRange) {
        case "week":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case "quarter":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case "year":
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(0);
      }
      where.createdAt = { gte: startDate };
    }

    // Build orderBy clause
    let orderBy: Record<string, string> = { createdAt: "desc" };

    switch (sortBy) {
      case "newest":
        orderBy = { createdAt: "desc" };
        break;
      case "most_students":
        orderBy = { studentCount: "desc" };
        break;
      case "alphabetical":
        orderBy = { title: "asc" };
        break;
      case "rating":
        orderBy = { rating: "desc" };
        break;
    }

    // Handle tab-based queries
    if (tab === "hot") {
      orderBy = { studentCount: "desc" };
    } else if (tab === "new") {
      orderBy = { createdAt: "desc" };
    } else if (tab === "recommended") {
      orderBy = { rating: "desc" };
    }

    const courses = await db.course.findMany({
      where,
      orderBy,
      include: {
        category: true,
        creator: { select: { id: true, name: true, avatar: true } },
        _count: {
          select: {
            lessons: true,
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
      creator: course.creator
        ? { id: course.creator.id, name: course.creator.name, avatar: course.creator.avatar }
        : null,
      lessonsCount: course._count.lessons,
      enrollmentsCount: course._count.enrollments,
    }));

    return NextResponse.json({ success: true, data: formattedCourses });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error fetching courses:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch courses" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // The creator is whoever is signed in. It used to come from the request
    // body, so a caller could create a course owned by someone else — and
    // ownership is what every later authorization check reads.
    let creatorId: string;
    try {
      const user = await requireUser();
      if (user.role !== "instructor") {
        return NextResponse.json(
          { success: false, error: "Only instructors can create courses." },
          { status: 403 },
        );
      }
      creatorId = user.id;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const body = await request.json();
    const { title, description, categoryId, language, coverImage, lessons } = body;

    if (!title) {
      return NextResponse.json({ success: false, error: "Title is required" }, { status: 400 });
    }

    const course = await db.course.create({
      data: {
        title,
        description: description || null,
        categoryId: categoryId || null,
        language: language || "english",
        creatorId,
        coverImage: coverImage || null,
        status: "draft",
        lessons: lessons
          ? {
              create: lessons.map((lesson: { title: string; order: number }, index: number) => ({
                title: lesson.title,
                order: lesson.order ?? index,
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        creator: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        lessons: {
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json({ success: true, data: course }, { status: 201 });
  } catch (error) {
    const denied = authFailure(error);
    if (denied) return denied;
    console.error("Error creating course:", error);
    return NextResponse.json({ success: false, error: "Failed to create course" }, { status: 500 });
  }
}
