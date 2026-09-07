"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, ChevronUp, Loader2, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function CourseAssistant({
  courseId,
  courseTitle,
  lessonCount,
  workspace = false,
}: {
  courseId: string;
  courseTitle: string;
  lessonCount: number;
  /** A dedicated knowledge-base page stays open and gives the transcript room. */
  workspace?: boolean;
}) {
  const [open, setOpen] = useState(workspace);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const ask = useCallback(
    async (suggestion?: string) => {
      const question = (suggestion ?? draft).trim();
      if (!question || sending) return;
      const history = messages.map(({ role, content }) => ({ role, content }));
      const answerId = `course-answer-${Date.now()}`;
      setMessages((current) => [
        ...current,
        { id: `course-question-${Date.now()}`, role: "user", content: question },
        { id: answerId, role: "assistant", content: "" },
      ]);
      setDraft("");
      setError(null);
      setSending(true);
      try {
        const response = await fetch(`/api/courses/${courseId}/assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history }),
        });
        if (!response.ok || !response.body) {
          const json = await response.json().catch(() => null);
          throw new Error(json?.error ?? "The course assistant could not answer.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setMessages((current) =>
            current.map((message) =>
              message.id === answerId ? { ...message, content: answer } : message,
            ),
          );
        }
        if (!answer.trim()) throw new Error("The course assistant returned an empty answer.");
      } catch (caught) {
        setMessages((current) => current.filter((message) => message.id !== answerId));
        setError(caught instanceof Error ? caught.message : "Please try again.");
      } finally {
        setSending(false);
      }
    },
    [courseId, draft, messages, sending],
  );

  const suggestions = [
    "Give me a learning path through this course",
    "Connect the key ideas across the lessons",
    "What should I review before the quizzes?",
  ];

  return (
    <section className="via-background dark:via-background relative overflow-hidden rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-teal-50 shadow-sm dark:border-emerald-900/60 dark:from-emerald-950/30 dark:to-teal-950/20">
      <div className="absolute -top-20 -right-16 h-48 w-48 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative flex w-full items-center gap-4 p-5 text-left sm:p-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
          <Bot className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-foreground font-semibold">Course AI Assistant</span>
            <Badge className="border-0 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
              {lessonCount} lesson knowledge base
            </Badge>
          </span>
          <span className="text-muted-foreground mt-1 block text-sm">
            Ask across the whole course, compare lessons, or build a study path.
          </span>
        </span>
        {!workspace && (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="text-muted-foreground hover:text-foreground -m-2 rounded-lg p-2 transition-colors"
            aria-expanded={open}
            aria-label={open ? "Collapse course assistant" : "Expand course assistant"}
          >
            {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        )}
      </div>

      {open && (
        <div className="relative border-t border-emerald-200/60 dark:border-emerald-900/50">
          <div
            ref={scrollRef}
            className={
              workspace
                ? "min-h-[32rem] space-y-3 overflow-y-auto p-4 sm:max-h-[58vh] sm:p-6"
                : "max-h-[26rem] min-h-64 space-y-3 overflow-y-auto p-4 sm:p-5"
            }
          >
            {messages.length === 0 && (
              <div className="py-4 text-center">
                <Sparkles className="mx-auto h-7 w-7 text-emerald-500" />
                <p className="text-foreground mt-2 text-sm font-medium">Ready for {courseTitle}</p>
                <p className="text-muted-foreground mx-auto mt-1 max-w-md text-xs leading-relaxed">
                  Answers are grounded only in generated lessons from this course. Choose a prompt
                  or ask your own.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto rounded-full py-1.5 text-xs"
                      onClick={() => void ask(suggestion)}
                      disabled={sending}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={
                    message.role === "user"
                      ? "max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600 px-3.5 py-2.5 text-sm text-white"
                      : "bg-card text-foreground max-w-[90%] rounded-2xl rounded-bl-sm border px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-sm"
                  }
                >
                  {message.content || (
                    <span className="text-muted-foreground inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching the course…
                    </span>
                  )}
                </div>
              </div>
            ))}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                <X className="h-3.5 w-3.5" /> {error}
              </div>
            )}
          </div>
          <div className="bg-background/80 flex gap-2 border-t p-3 backdrop-blur-sm">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              placeholder="Ask about any lesson in this course…"
              rows={1}
              className="max-h-28 min-h-10 resize-none"
              disabled={sending}
            />
            <Button
              type="button"
              size="icon"
              onClick={() => void ask()}
              disabled={sending || !draft.trim()}
              aria-label="Send to course assistant"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
