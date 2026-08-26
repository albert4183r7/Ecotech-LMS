import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireUser, AuthorizationError } from "@/lib/session";
import {
  answerPlatformQuestion,
  MAX_HISTORY_TURNS,
  MAX_QUESTION_CHARS,
} from "@/lib/assistant/platform-help";

// ============================================
// POST /api/support/chat
//
// The platform's help assistant, answering one question and streaming the
// reply. It knows how Ecotech works and nothing about what any lesson
// teaches — the lesson assistant does that, grounded in the lesson itself.
//
// Signed-in only. Not because the answers are secret, but because an
// unauthenticated endpoint that calls a model is a bill anyone can run up.
// ============================================

const AskSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(MAX_HISTORY_TURNS * 2)
    .optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser();

    const parsed = AskSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }

    const stream = answerPlatformQuestion({
      question: parsed.data.question,
      history: parsed.data.history ?? [],
    });

    // The first chunk is pulled before the response is committed: almost every
    // failure happens on the first token, and once a 200 has gone out the
    // status can no longer say so.
    let first;
    try {
      first = await stream.next();
    } catch (error) {
      console.error("[support.chat] the model call failed:", error);
      return NextResponse.json(
        { success: false, error: "Help is unavailable right now. Please try again." },
        { status: 502 },
      );
    }
    if (first.done) {
      return NextResponse.json(
        { success: false, error: "No answer came back. Please try rephrasing." },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(first.value));
          for await (const chunk of stream) controller.enqueue(encoder.encode(chunk));
        } catch (error) {
          console.error("[support.chat] stream failed mid-answer:", error);
          controller.enqueue(encoder.encode("\n\n[error] The answer was cut short."));
        } finally {
          controller.close();
        }
      },
    });

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("[support.chat]", error);
    return NextResponse.json({ success: false, error: "Help is unavailable." }, { status: 500 });
  }
}
