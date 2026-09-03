import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let actingUserId: string;
    try {
      actingUserId = (await requireUser()).id;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    // The enrolment must be the caller's own.
    const existing = await db.enrollment.findUnique({
      where: { id },
      select: { userId: true, courseId: true, status: true },
    });
    if (!existing || existing.userId !== actingUserId) {
      return NextResponse.json({ success: false, error: "Enrollment not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body;

    // Validate status
    // Completion is derived from lesson progress by /api/progress. Accepting
    // "completed" here would be a second self-certification path.
    const validStatuses = ["in_progress", "dropped"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status) {
      updateData.status = status;
      updateData.completedAt = null;
    }

    const updated = await db.$transaction(async (tx) => {
      const row = await tx.enrollment.update({
        where: { id },
        data: updateData,
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

      if (status && status !== existing.status) {
        const studentCount = await tx.enrollment.count({
          where: { courseId: existing.courseId, status: { not: "dropped" } },
        });
        await tx.course.update({
          where: { id: existing.courseId },
          data: { studentCount },
        });
      }
      return row;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating enrollment:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update enrollment" },
      { status: 500 },
    );
  }
}
