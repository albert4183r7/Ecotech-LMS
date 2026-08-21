import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, AuthorizationError } from "@/lib/session";

/**
 * DELETE /api/comments/[id]
 * Delete a comment (only own comments)
 * Query: ?userId=xxx
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

    // The owner is the signed-in user, not whoever the query string names.
    const userId = actingUserId;

    // Find the comment and verify ownership
    const comment = await db.comment.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!comment) {
      return NextResponse.json({ success: false, error: "Comment not found" }, { status: 404 });
    }

    if (comment.userId !== userId) {
      return NextResponse.json(
        { success: false, error: "You can only delete your own comments" },
        { status: 403 },
      );
    }

    // Delete the comment (cascades to replies)
    await db.comment.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    console.error("DELETE /api/comments/[id] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete comment" },
      { status: 500 },
    );
  }
}
