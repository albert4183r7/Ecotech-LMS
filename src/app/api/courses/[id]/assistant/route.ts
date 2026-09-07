import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { AuthorizationError, requireCourseReader } from "@/lib/session";
import {
  answerCourseQuestion,
  loadCourseSource,
  MAX_COURSE_HISTORY_TURNS,
  MAX_COURSE_QUESTION_CHARS,
} from "@/lib/assistant/course-tutor";
import { AI_CHAT_RULE, consumeAuthenticatedRequest } from "@/lib/rate-limit";

const AskSchema = z.object({
  question: z.string().trim().min(1).max(MAX_COURSE_QUESTION_CHARS),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(MAX_COURSE_HISTORY_TURNS * 2)
    .optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireCourseReader(id);
    const limited = consumeAuthenticatedRequest(
      request.headers,
      user.id,
      "ai:course-chat",
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
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request." },
        { status: 400 },
      );
    }
    const source = await loadCourseSource(id);
    if (!source || source.lessons.length === 0) {
      return NextResponse.json(
        { success: false, error: "This course has no generated lesson content yet." },
        { status: 409 },
      );
    }

    const stream = answerCourseQuestion({
      source,
      question: parsed.data.question,
      history: parsed.data.history ?? [],
    });
    let first;
    try {
      first = await stream.next();
    } catch (error) {
      console.error("[courses.assistant] model call failed:", error);
      return NextResponse.json(
        { success: false, error: "The course assistant is unavailable right now." },
        { status: 502 },
      );
    }
    if (first.done) {
      return NextResponse.json(
        { success: false, error: "The assistant had no answer. Try rephrasing." },
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
          console.error("[courses.assistant] stream failed:", error);
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
    console.error("[courses.assistant]", error);
    return NextResponse.json(
      { success: false, error: "The course assistant is unavailable right now." },
      { status: 500 },
    );
  }
}
