import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { requireLessonOwner } from "@/lib/session";

// ============================================
// /api/slides/[id]
//
// The outline editor's two operations: rename a planned slide, and remove one.
// Both had no authorization at all, so any signed-in caller could retitle or
// delete a slide in anyone's course.
//
// htmlBody is deliberately not writable here. Slide markup is produced by the
// renderer from structured content; letting a client post arbitrary HTML made
// the stored slide and its contentJson disagree, and was the write path the
// removed AI-edit endpoints used. Content changes go through
// /api/slides/[id]/edit-field, which edits one field and re-renders.
// ============================================

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("slides.PUT", async () => {
    const { id } = await params;

    const slide = await db.slide.findUnique({
      where: { id },
      select: { id: true, lessonId: true, order: true },
    });
    if (!slide) return fail("Slide not found.", 404);

    await requireLessonOwner(slide.lessonId);

    const body = await request.json();
    const { title, order } = body;

    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return fail("title must be a non-empty string.", 400);
    }
    if (order !== undefined && !Number.isInteger(order)) {
      return fail("order must be an integer.", 400);
    }

    const updated = await db.$transaction(async (tx) => {
      if (order !== undefined && order !== slide.order) {
        const count = await tx.slide.count({ where: { lessonId: slide.lessonId } });
        if (order < 0 || order >= count) return null;

        // Free the source position first, then shift neighbours one at a time
        // in the direction that keeps every @@unique([lessonId, order]) value
        // free. A direct update collides with the slide already at `order`.
        const minimum = await tx.slide.aggregate({
          where: { lessonId: slide.lessonId },
          _min: { order: true },
        });
        const temporaryOrder = (minimum._min.order ?? 0) - 1;
        await tx.slide.update({ where: { id }, data: { order: temporaryOrder } });
        if (order > slide.order) {
          const shifted = await tx.slide.findMany({
            where: { lessonId: slide.lessonId, order: { gt: slide.order, lte: order } },
            orderBy: { order: "asc" },
            select: { id: true, order: true },
          });
          for (const row of shifted) {
            await tx.slide.update({ where: { id: row.id }, data: { order: row.order - 1 } });
          }
        } else {
          const shifted = await tx.slide.findMany({
            where: { lessonId: slide.lessonId, order: { gte: order, lt: slide.order } },
            orderBy: { order: "desc" },
            select: { id: true, order: true },
          });
          for (const row of shifted) {
            await tx.slide.update({ where: { id: row.id }, data: { order: row.order + 1 } });
          }
        }
      }

      return tx.slide.update({
        where: { id },
        data: {
          ...(title !== undefined && { title: title.trim().slice(0, 90) }),
          ...(order !== undefined && { order }),
        },
      });
    });

    if (!updated) return fail("order is outside this lesson's slide range.", 400);

    return ok(updated);
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleRoute("slides.DELETE", async () => {
    const { id } = await params;

    const slide = await db.slide.findUnique({
      where: { id },
      select: { id: true, lessonId: true },
    });
    if (!slide) return fail("Slide not found.", 404);

    await requireLessonOwner(slide.lessonId);
    await db.slide.delete({ where: { id } });

    return ok({ id });
  });
}
