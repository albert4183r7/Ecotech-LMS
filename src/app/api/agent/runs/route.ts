import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireLessonOwner, requireUser, AuthorizationError } from "@/lib/session";
import { runLessonAgent } from "@/lib/agent/agents/lesson-agent";
import type { StoredOutline } from "@/lib/presentation-plan";

// ============================================
// POST /api/agent/runs   start an agent run
// GET  /api/agent/runs?runId=... | ?lessonId=...   read progress
// ============================================

interface StartRunRequest {
  kind?: "lesson";
  lessonId: string;
  audience?: string;
  language?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as StartRunRequest;
    if (!body.lessonId) {
      return NextResponse.json({ success: false, error: "lessonId is required" }, { status: 400 });
    }

    // An agent run writes to the lesson and spends generation budget.
    try {
      await requireLessonOwner(body.lessonId);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    const lesson = await db.lesson.findUnique({
      where: { id: body.lessonId },
      include: { course: { select: { language: true } } },
    });
    if (!lesson) {
      return NextResponse.json({ success: false, error: "Lesson not found" }, { status: 404 });
    }

    let referenceFileUrls: string[] | undefined;
    let language = body.language ?? lesson.course?.language ?? "english";
    try {
      if (lesson.outlineJson) {
        const outline = JSON.parse(lesson.outlineJson) as StoredOutline;
        referenceFileUrls = outline.referenceSources?.map((s) => s.file);
        language = body.language ?? outline.language ?? language;
      }
    } catch {
      // An unreadable outline is not a reason to refuse the run.
    }

    // Fire and forget is deliberate: an agent run takes minutes. Progress is
    // durable in AgentRun/AgentStep, so the client polls rather than waits.
    const started = runLessonAgent({
      lessonId: body.lessonId,
      referenceFileUrls,
      language,
      audience: body.audience,
    });

    const runId = await new Promise<string | null>((resolve) => {
      // Give the run a moment to register itself so the caller gets an id.
      const timer = setTimeout(() => resolve(null), 3000);
      started
        .then((r) => {
          clearTimeout(timer);
          resolve(r.runId);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    });

    started.catch((err) => console.error("[agent/runs] run failed:", err));

    const latest = await db.agentRun.findFirst({
      where: { lessonId: body.lessonId },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });

    return NextResponse.json({
      success: true,
      data: { runId: runId ?? latest?.id ?? null, status: latest?.status ?? "RUNNING" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start run";
    console.error("[agent/runs] POST error:", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  const lessonId = searchParams.get("lessonId");

  if (!runId && !lessonId) {
    return NextResponse.json(
      { success: false, error: "runId or lessonId is required" },
      { status: 400 },
    );
  }

  const run = await db.agentRun.findFirst({
    where: runId ? { id: runId } : { lessonId: lessonId! },
    orderBy: { createdAt: "desc" },
    include: {
      steps: { orderBy: { index: "asc" } },
      evaluations: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!run) {
    return NextResponse.json({ success: false, error: "Run not found" }, { status: 404 });
  }

  // A run carries the lesson's generated text and its evaluations, so reading
  // one is reading the instructor's unpublished work.
  try {
    if (run.lessonId) await requireLessonOwner(run.lessonId);
    else await requireUser();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: "Run not found" }, { status: 404 });
    }
    throw error;
  }

  return NextResponse.json({
    success: true,
    data: {
      runId: run.id,
      status: run.status,
      stopReason: run.stopReason,
      finalText: run.finalText,
      totalTokens: run.totalTokens,
      durationMs: run.durationMs,
      steps: run.steps.map((s) => ({
        index: s.index,
        text: s.text,
        toolCalls: JSON.parse(s.toolCalls) as unknown[],
        tokens: s.inTokens + s.outTokens,
      })),
      evaluations: run.evaluations.map((e) => ({
        scope: e.scope,
        score: e.score,
        passed: e.passed,
        slideId: e.slideId,
        findings: JSON.parse(e.findings) as unknown[],
      })),
    },
  });
}
