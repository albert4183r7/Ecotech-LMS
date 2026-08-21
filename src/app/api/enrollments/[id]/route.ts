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
      select: { userId: true },
    });
    if (!existing || existing.userId !== actingUserId) {
      return NextResponse.json({ success: false, error: "Enrollment not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status } = body;

    // Validate status
    const validStatuses = ["in_progress", "completed", "dropped"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }

    const enrollment = await db.enrollment.findUnique({ where: { id } });

    if (!enrollment) {
      return NextResponse.json({ success: false, error: "Enrollment not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (status) {
      updateData.status = status;
      if (status === "completed") {
        updateData.completedAt = new Date();
      }
    }

    const updated = await db.enrollment.update({
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

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating enrollment:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update enrollment" },
      { status: 500 },
    );
  }
}
