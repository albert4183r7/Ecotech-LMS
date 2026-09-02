import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { loadLessonSource } from "@/lib/quiz/lesson-source";
import { generateNarration } from "@/lib/video/narration";
import { assertTtsReady, DEFAULT_TTS_VOICE, generateSpeech } from "@/lib/video/tts";

const AUDIO_ROOT = path.join(process.cwd(), "public", "uploads", "audio");
const configuredTtsConcurrency = Number(process.env.TTS_CONCURRENCY ?? 2);
const TTS_CONCURRENCY = Number.isFinite(configuredTtsConcurrency)
  ? Math.max(1, Math.floor(configuredTtsConcurrency))
  : 2;

export interface VideoGenerationResult {
  status: "READY" | "ERROR";
  videoId?: string;
  sceneCount?: number;
  error?: string;
}

async function withConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) await worker(items[cursor++]);
    }),
  );
}

async function recordVideoFailure(lessonId: string, error: string): Promise<void> {
  await db.lessonVideo
    .upsert({
      where: { lessonId },
      create: {
        lessonId,
        status: "ERROR",
        voice: DEFAULT_TTS_VOICE,
        language: "english",
        error,
      },
      update: { status: "ERROR", error },
    })
    .catch((failure) =>
      console.error(`[video] lesson ${lessonId}: could not record failure`, failure),
    );
}

/** Build narration, synthesize MP3 scenes, and persist a playable lesson. */
export async function generateAndSaveNarratedLesson(
  lessonId: string,
  options: { voice?: string; language?: string } = {},
): Promise<VideoGenerationResult> {
  try {
    const source = await loadLessonSource(lessonId);
    if (!source) {
      const error = "The lesson has no ready slides to narrate.";
      await recordVideoFailure(lessonId, error);
      return { status: "ERROR", error };
    }

    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      select: { outlineJson: true, course: { select: { language: true } } },
    });
    const outlineLanguage = (() => {
      try {
        return JSON.parse(lesson?.outlineJson ?? "{}").language as string | undefined;
      } catch {
        return undefined;
      }
    })();
    const language = options.language || outlineLanguage || lesson?.course.language || "english";
    const voice = options.voice?.trim() || DEFAULT_TTS_VOICE;

    await db.lessonVideo.upsert({
      where: { lessonId },
      create: { lessonId, status: "GENERATING", voice, language, error: null },
      update: { status: "GENERATING", voice, language, error: null },
    });

    // A single preflight gives the instructor one actionable error instead of
    // retrying the same missing local service once for every scene.
    await assertTtsReady();
    const draft = await generateNarration(source, language);
    const video = await db.$transaction(async (tx) => {
      const row = await tx.lessonVideo.update({
        where: { lessonId },
        data: { status: "GENERATING", voice, language, sourceHash: draft.sourceHash, error: null },
      });
      await tx.videoScene.deleteMany({ where: { videoId: row.id } });
      await tx.videoScene.createMany({
        data: draft.scenes.map((scene) => ({
          videoId: row.id,
          slideId: scene.slideId,
          order: scene.order,
          narration: scene.narration,
          caption: scene.caption,
          sourceHash: scene.sourceHash,
          status: "DRAFT",
        })),
      });
      return row;
    });

    const scenes = await db.videoScene.findMany({
      where: { videoId: video.id },
      orderBy: { order: "asc" },
    });
    const failures: string[] = [];
    const lessonDir = path.join(AUDIO_ROOT, lessonId);
    await mkdir(lessonDir, { recursive: true });

    await withConcurrency(scenes, TTS_CONCURRENCY, async (scene) => {
      await db.videoScene.update({
        where: { id: scene.id },
        data: { status: "GENERATING", error: null },
      });
      try {
        const audio = await generateSpeech(scene.narration, { voice, language });
        const fileName = `${scene.order + 1}-${randomUUID()}.mp3`;
        await writeFile(path.join(lessonDir, fileName), audio);
        await db.videoScene.update({
          where: { id: scene.id },
          data: {
            audioUrl: `/uploads/audio/${lessonId}/${fileName}`,
            status: "READY",
            error: null,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "TTS generation failed.";
        failures.push(`scene ${scene.order + 1}: ${message}`);
        await db.videoScene.update({
          where: { id: scene.id },
          data: { status: "ERROR", error: message },
        });
      }
    });

    if (failures.length > 0) {
      const error = `${failures.length} of ${scenes.length} narration scenes failed. ${failures[0]}`;
      await db.lessonVideo.update({
        where: { id: video.id },
        data: { status: "ERROR", error },
      });
      return { status: "ERROR", videoId: video.id, sceneCount: scenes.length, error };
    }

    await db.lessonVideo.update({
      where: { id: video.id },
      data: { status: "READY", error: null },
    });
    console.log(`[video] lesson ${lessonId}: ${scenes.length} narrated scene(s) ready`);
    return { status: "READY", videoId: video.id, sceneCount: scenes.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video lesson generation failed.";
    console.error(`[video] lesson ${lessonId} failed:`, message);
    await recordVideoFailure(lessonId, message);
    return { status: "ERROR", error: message };
  }
}
