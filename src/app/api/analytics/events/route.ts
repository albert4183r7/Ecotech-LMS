import { NextRequest } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { fail, handleRoute, ok } from "@/lib/api-response";
import { requireCourseReader } from "@/lib/session";

const EventSchema = z.object({
  courseId: z.string().min(1),
  lessonId: z.string().min(1),
  slideId: z.string().min(1),
  type: z.literal("SLIDE_VIEW"),
  durationSeconds: z.number().int().min(1).max(1800),
});

export async function POST(request: NextRequest) {
  return handleRoute("analytics.events.POST", async () => {
    const parsed = EventSchema.safeParse(await request.json());
    if (!parsed.success) return fail("Invalid learning event.", 400);
    const event = parsed.data;
    const { user, isOwner } = await requireCourseReader(event.courseId);
    if (isOwner || user.role !== "student") return fail("Student telemetry only.", 403);
    const slide = await db.slide.findFirst({
      where: { id: event.slideId, lessonId: event.lessonId, lesson: { courseId: event.courseId } },
      select: { id: true },
    });
    if (!slide) return fail("Slide not found.", 404);
    await db.learningEvent.create({ data: { ...event, userId: user.id } });
    return ok({ recorded: true });
  });
}
