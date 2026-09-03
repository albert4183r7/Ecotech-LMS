import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireLessonReader, AuthorizationError } from "@/lib/session";
import { loadLessonSource } from "@/lib/quiz/lesson-source";
import {
  answerLessonQuestion,
  MAX_HISTORY_TURNS,
  MAX_QUESTION_CHARS,
} from "@/lib/assistant/lesson-tutor";
import { AI_CHAT_RULE, consumeAuthenticatedRequest } from "@/lib/rate-limit";

// ============================================
// POST /api/lessons/[id]/assistant
//
// The lesson's assistant, answering one question and streaming the reply.
//
// The lesson it answers about is the one in the URL, and its content is read
// from the database here — never taken from the request. A student cannot
// widen the assistant's scope by sending different material, because the
// request has no field that could carry any. What the client does send is the
// conversation so far, which is its own text coming back.
//
// Access is the same rule the lesson itself uses: the course's instructor, or
// a student enrolled in the published course. Anyone else gets not found, so
// the endpoint cannot be used to discover which lessons exist.
// ============================================

const AskSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_CHARS),
  /** Which slide is on screen, so "this slide" resolves to the right one. */
  currentSlideNumber: z.number().int().positive().max(500).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(MAX_HISTORY_TURNS * 2)
    .optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireLessonReader(id);
    const limited = consumeAuthenticatedRequest(
      request.headers,
      user.id,
      "ai:lesson-chat",
      AI_CHAT_RULE,
    );
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many assistant requests. Please wait and try again." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    const parsed = AskSchema.safeParse(await request.json());
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? "Invalid request.";
      return NextResponse.json({ success: false, error: reason }, { status: 400 });
    }

    const source = await loadLessonSource(id);
    if (!source) {
      return NextResponse.json(
        { success: false, error: "This lesson has no content to answer from yet." },
        { status: 409 },
      );
    }

    const stream = answerLessonQuestion({
      source,
      currentSlideNumber: parsed.data.currentSlideNumber,
      question: parsed.data.question,
      history: parsed.data.history ?? [],
    });

    // The first chunk is pulled before the response is committed. Almost every
    // way this fails — a rejected key, an unreachable gateway, a model error —
    // fails on the first token, and once a 200 has gone out the status can no
    // longer say so: the client would receive a successful empty answer.
    let first;
    try {
      first = await stream.next();
    } catch (error) {
      console.error("[lessons.assistant] the model call failed:", error);
      return NextResponse.json(
        { success: false, error: "The assistant is unavailable right now. Please try again." },
        { status: 502 },
      );
    }
    if (first.done) {
      return NextResponse.json(
        { success: false, error: "The assistant had no answer. Please try rephrasing." },
        { status: 502 },
      );
    }

    // Streamed as plain text: the answer arrives as it is written rather than
    // after a wait long enough to look broken.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          controller.enqueue(encoder.encode(first.value));
          for await (const chunk of stream) controller.enqueue(encoder.encode(chunk));
        } catch (error) {
          // Past the first token the status is already sent, so the failure
          // has to travel in the body. The marker lets the client show a
          // truncated answer as truncated rather than as a complete one.
          console.error("[lessons.assistant] stream failed mid-answer:", error);
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
    console.error("[lessons.assistant]", error);
    return NextResponse.json(
      { success: false, error: "The assistant is unavailable right now." },
      { status: 500 },
    );
  }
}
