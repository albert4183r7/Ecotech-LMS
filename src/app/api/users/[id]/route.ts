import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ACCOUNT_ROLES, requireUser, AuthorizationError } from "@/lib/session";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // This returns an account's email and its full learning history, so it is
    // yours to read and nobody else's. It had no check at all, which made
    // every user's profile readable by id, signed in or not.
    const sessionUser = await requireUser();
    if (sessionUser.id !== id) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    const user = await db.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            enrollments: true,
            favorites: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Calculate learning stats
    const enrollments = await db.enrollment.findMany({
      where: { userId: id },
      include: {
        progresses: true,
        course: {
          include: {
            _count: {
              select: { lessons: true },
            },
          },
        },
      },
    });

    const totalCourses = enrollments.length;
    const inProgress = enrollments.filter((e) => e.status === "in_progress").length;
    const completed = enrollments.filter((e) => e.status === "completed").length;

    // Calculate average progress across all enrollments
    let totalProgress = 0;
    let enrollmentCount = 0;

    for (const enrollment of enrollments) {
      const totalLessons = enrollment.course._count.lessons;
      if (totalLessons > 0) {
        const completedLessons = enrollment.progresses.filter((p) => p.completed).length;
        totalProgress += (completedLessons / totalLessons) * 100;
        enrollmentCount++;
      }
    }

    const avgProgress = enrollmentCount > 0 ? Math.round(totalProgress / enrollmentCount) : 0;

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: sessionUser.role,
        roles: [...ACCOUNT_ROLES],
        department: user.department,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        stats: {
          totalCourses,
          inProgress,
          completed,
          avgProgress,
          favoritesCount: user._count.favorites,
        },
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Error fetching user profile:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch user profile" },
      { status: 500 },
    );
  }
}
