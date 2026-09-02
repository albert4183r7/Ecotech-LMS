import { after, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { handleRoute, ok, fail } from "@/lib/api-response";
import { requireLessonOwner } from "@/lib/session";
import { generateAndSaveNarratedLesson } from "@/lib/video/generate";
import { DEFAULT_TTS_VOICE } from "@/lib/video/tts";

interface GenerateVideoRequest {
  voice?: string;
}

// Regenerate only the narrated artifact. This is deliberately separate from
// slide generation so a provider outage can be retried without rewriting a
// deck or a quiz that already passed review.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute("lessons.video.POST", async () => {
    const { id } = await params;
    await requireLessonOwner(id);

    const body = (await request.json().catch(() => ({}))) as GenerateVideoRequest;
    const voice = body.voice?.trim() || DEFAULT_TTS_VOICE;
    if (voice.length > 80 || !/^[\w.-]+$/.test(voice)) {
      return fail("voice must be a valid OpenAI-compatible voice name.", 400);
    }

    const lesson = await db.lesson.findUnique({
      where: { id },
      select: {
        id: true,
        outlineJson: true,
        course: { select: { language: true } },
        slides: { select: { status: true } },
        video: { select: { id: true, status: true } },
      },
    });
    if (!lesson) return fail("Lesson not found.", 404);
    if (lesson.slides.length === 0 || lesson.slides.some((slide) => slide.status !== "READY")) {
      return fail("All slides must be ready before the narrated lesson can be generated.", 409);
    }
    if (lesson.video?.status === "GENERATING") {
      return fail("The narrated lesson is already being generated.", 409);
    }

    let language = lesson.course.language || "english";
    try {
      const outline = JSON.parse(lesson.outlineJson ?? "{}") as { language?: string };
      language = outline.language || language;
    } catch {
      // The course language is the safe fallback for legacy outline data.
    }

    const video = await db.lessonVideo.upsert({
      where: { lessonId: id },
      create: { lessonId: id, status: "GENERATING", voice, language, error: null },
      update: { status: "GENERATING", voice, language, error: null },
    });

    after(async () => {
      await generateAndSaveNarratedLesson(id, { voice, language }).catch((error) =>
        console.error(`[video] lesson ${id}: background generation failed`, error),
      );
    });

    return ok({ id: video.id, lessonId: id, status: "GENERATING", voice, language });
  });
}
