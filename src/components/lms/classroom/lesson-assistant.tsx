"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// ============================================
// Lesson assistant
//
// A tutor for the lesson on screen, in the classroom's right-hand panel. It
// answers from that lesson's content and refuses everything else, which the
// server enforces — this component only shows the conversation.
//
// The conversation belongs to one lesson. Moving to the next lesson clears
// it, so an answer about lesson 1 can never be follow-up context for a
// question about lesson 2.
// ============================================

const MAX_QUESTION_CHARS = 1000;

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface LessonAssistantProps {
  lessonId: string;
  lessonTitle: string;
  /** 1-based, so "this slide" means the one the learner can see. */
  currentSlideNumber: number;
}

export function LessonAssistant({
  lessonId,
  lessonTitle,
  currentSlideNumber,
}: LessonAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A new lesson is a new conversation. Without this the previous lesson's
  // exchange would be replayed as context for the next one's questions.
  useEffect(() => {
    setMessages([]);
    setDraft("");
    setError(null);
  }, [lessonId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = useCallback(async () => {
    const question = draft.trim();
    if (!question || sending) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const answerId = `a${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: `q${Date.now()}`, role: "user", content: question },
      { id: answerId, role: "assistant", content: "" },
    ]);
    setDraft("");
    setError(null);
    setSending(true);

    try {
      const res = await fetch(`/api/lessons/${lessonId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, currentSlideNumber, history }),
      });

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "The assistant could not answer that.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        answer += decoder.decode(value, { stream: true });
        setMessages((prev) => prev.map((m) => (m.id === answerId ? { ...m, content: answer } : m)));
      }
      if (!answer.trim()) throw new Error("The assistant returned an empty answer.");
    } catch (err) {
      // The empty answer bubble goes with the failure, so the panel does not
      // leave a blank reply sitting under the question.
      setMessages((prev) => prev.filter((m) => m.id !== answerId));
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  }, [draft, sending, messages, lessonId, currentSlideNumber]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !error && (
          <div className="text-muted-foreground space-y-3 py-6 text-center">
            <Sparkles className="text-primary/60 mx-auto h-7 w-7" />
            <p className="text-sm font-medium">Ask me about this lesson</p>
            <p className="mx-auto max-w-[15rem] text-xs leading-relaxed">
              I can explain anything in <span className="font-medium">{lessonTitle}</span> — a term,
              an example, or what a slide is getting at. I only know this lesson.
            </p>
          </div>
        )}

        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm break-words whitespace-pre-wrap">
                {message.content}
              </p>
            </div>
          ) : (
            <div key={message.id} className="flex justify-start">
              <div className="bg-muted text-foreground max-w-[90%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
                {message.content || (
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Thinking…
                  </span>
                )}
              </div>
            </div>
          ),
        )}

        {error && (
          <div className="text-destructive bg-destructive/10 flex items-start gap-2 rounded-lg px-3 py-2 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_QUESTION_CHARS))}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a new line, as a chat box should be.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
          placeholder="Ask a question about this lesson…"
          rows={2}
          disabled={sending}
          aria-label="Ask the lesson assistant a question"
          className="max-h-32 resize-none text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-[11px]">
            {draft.length > MAX_QUESTION_CHARS - 100
              ? `${MAX_QUESTION_CHARS - draft.length} characters left`
              : "Enter to send"}
          </span>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => void ask()}
            disabled={sending || !draft.trim()}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {sending ? "Answering" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
