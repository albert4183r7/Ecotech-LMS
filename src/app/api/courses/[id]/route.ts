import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { requireCourseOwner, getSessionUser } from "@/lib/session";
import { handleRoute, ok } from "@/lib/api-response";

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
          include: {
            sections: { orderBy: { order: "asc" } },
            slides: { orderBy: { order: "asc" } },
          },
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
    // Ownership is decided from the session, never from a client-supplied id,
    // so the buttons the page offers match what the API would actually allow.
    const sessionUser = await getSessionUser();
    const isOwner = Boolean(sessionUser && course.creatorId === sessionUser.id);

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
        // Sections and slides are needed to rebuild the outline view when a
        // draft course is reopened. Without them the editor showed an empty
        // lesson even though its slides were generated and stored.
        sections: lesson.sections.map((section) => ({
          id: section.id,
          title: section.title,
          summary: section.summary,
          subtopics: (() => {
            try {
              return JSON.parse(section.subtopics) as string[];
            } catch {
              return [];
            }
          })(),
          slideBudget: section.slideBudget,
          order: section.order,
        })),
        slides: lesson.slides.map((slide) => ({
          id: slide.id,
          title: slide.title,
          htmlBody: slide.htmlBody,
          status: slide.status,
          order: slide.order,
          sectionId: slide.sectionId,
        })),
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      })),
      enrollmentsCount: course._count.enrollments,
      favoritesCount: course._count.favorites,
      isEnrolled,
      isFavorited,
      isOwner,
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

/**
 * PUT /api/courses/[id] — update a course, including publishing it.
 *
 * This had no authorization at all: any caller could retitle or publish any
 * course. Ownership is now required, and only the presented fields change, so
 * editing a published course leaves its enrolments, progress, lessons, slides
 * and quizzes exactly as they were.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("courses.PUT", async () => {
    const { id } = await params;
    await requireCourseOwner(id);

    const body = await request.json();
    const { title, description, categoryId, language, coverImage, status } = body;

    if (status !== undefined && !["draft", "published", "archived"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "status must be draft, published or archived" },
        { status: 400 },
      );
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

    return ok(updated);
  });
}

/** Files under public/uploads that belong to this course and nothing else. */
function collectUploadedFiles(course: {
  coverImage: string | null;
  lessons: { outlineJson: string | null }[];
}): string[] {
  const urls = new Set<string>();
  if (course.coverImage?.startsWith("/uploads/")) urls.add(course.coverImage);

  for (const lesson of course.lessons) {
    if (!lesson.outlineJson) continue;
    try {
      const outline = JSON.parse(lesson.outlineJson) as {
        referenceFileUrls?: unknown;
        referenceSources?: { file?: unknown }[];
      };
      const candidates = [
        ...(Array.isArray(outline.referenceFileUrls) ? outline.referenceFileUrls : []),
        ...(Array.isArray(outline.referenceSources)
          ? outline.referenceSources.map((s) => s?.file)
          : []),
      ];
      for (const value of candidates) {
        if (typeof value === "string" && value.startsWith("/uploads/")) urls.add(value);
      }
    } catch {
      // A malformed outline just means no files to reclaim from it.
    }
  }
  return [...urls];
}

/**
 * DELETE /api/courses/[id] — remove a course and everything that belongs to it.
 *
 * Instructor-only, and only the course's own creator: requireCourseOwner
 * reports someone else's course as not found rather than forbidden, so the
 * endpoint cannot be used to discover which ids exist.
 *
 * Lessons, sections, slides, quizzes, enrolments, progress, comments, notes,
 * favourites and ratings are all removed by the cascades declared in the
 * schema. Agent runs are the exception — their relation is SetNull, so they
 * would survive as audit rows pointing at a lesson that no longer exists, and
 * they are deleted explicitly first. Uploaded covers and reference documents
 * are reclaimed afterwards; each upload has a UUID filename generated per
 * request, so a file referenced by this course belongs to no other.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute("courses.DELETE", async () => {
    const { id } = await params;
    await requireCourseOwner(id);

    const course = await db.course.findUnique({
      where: { id },
      select: {
        title: true,
        coverImage: true,
        lessons: { select: { id: true, outlineJson: true } },
      },
    });
    if (!course) {
      return NextResponse.json({ success: false, error: "Course not found" }, { status: 404 });
    }

    const lessonIds = course.lessons.map((l) => l.id);
    const files = collectUploadedFiles(course);

    // One transaction: either the whole course goes or none of it does, so a
    // failure part-way cannot leave a course with its lessons already removed.
    await db.$transaction(async (tx) => {
      if (lessonIds.length) {
        await tx.agentRun.deleteMany({ where: { lessonId: { in: lessonIds } } });
      }
      await tx.course.delete({ where: { id } });
    });

    // Files are reclaimed only once the database change has committed, so a
    // rolled-back delete never destroys a document the course still needs.
    const uploadRoot = path.join(process.cwd(), "public");
    for (const url of files) {
      const filePath = path.join(uploadRoot, url.replace(/^\//, ""));
      if (!path.normalize(filePath).startsWith(path.join(uploadRoot, "uploads"))) continue;
      await unlink(filePath).catch(() => {
        // A file already gone is the desired state; nothing to report.
      });
    }

    console.log(
      `[courses.DELETE] removed "${course.title}" (${lessonIds.length} lesson(s), ${files.length} file(s))`,
    );
    return ok({ id, deleted: true });
  });
}
