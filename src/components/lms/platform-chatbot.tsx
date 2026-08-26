"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ============================================
// The platform's help chat
//
// Sits in the corner of every signed-in page and answers questions about
// using Ecotech — where something is, what a control does, what a role may
// do. It deliberately does not teach: a question about what a lesson covers
// belongs to the study assistant beside that lesson, which is grounded in the
// lesson itself and can answer it honestly. The server enforces the split;
// this component only shows the conversation.
// ============================================

const MAX_QUESTION_CHARS = 600;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How do I publish a course?",
  "Can I upload my own PowerPoint?",
  "Where do I edit a quiz?",
];

export function PlatformChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Escape closes it, like every other overlay in the app.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const ask = useCallback(
    async (text?: string) => {
      const question = (text ?? draft).trim();
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
        const res = await fetch("/api/support/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history }),
        });
        if (!res.ok || !res.body) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error ?? "Help could not answer that.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let answer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === answerId ? { ...m, content: answer } : m)),
          );
        }
        if (!answer.trim()) throw new Error("No answer came back.");
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== answerId));
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      } finally {
        setSending(false);
      }
    },
    [draft, sending, messages],
  );

  return (
    <>
      {/* ---- Launcher ----
          Left of the keyboard-shortcuts button, so the corner's controls sit
          side by side rather than on top of each other. */}
      {!open && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Help with using Ecotech"
              style={{ right: "calc(5rem + var(--rail-offset, 0px))" }}
              className="bg-card text-foreground hover:bg-accent fixed bottom-6 z-40 flex h-10 w-10 items-center justify-center rounded-full border shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">Help with using Ecotech</TooltipContent>
        </Tooltip>
      )}

      {/* ---- Panel ---- */}
      {open && (
        <div
          role="dialog"
          aria-label="Ecotech help"
          style={{ right: "calc(1.5rem + var(--rail-offset, 0px))" }}
          className="bg-card fixed bottom-6 z-50 flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border shadow-2xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <HelpCircle className="text-primary h-4 w-4" />
              <span className="text-sm font-semibold">Ecotech help</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              aria-label="Close help"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && !error && (
              <div className="text-muted-foreground space-y-3 py-4 text-center">
                <HelpCircle className="text-primary/60 mx-auto h-7 w-7" />
                <p className="text-sm font-medium">Questions about using Ecotech</p>
                <p className="mx-auto max-w-[16rem] text-xs leading-relaxed">
                  Courses, lessons, quizzes, publishing — how the platform works. For what a lesson
                  teaches, open the lesson and ask the study assistant beside it.
                </p>
                <div className="flex flex-col items-stretch gap-1.5 pt-1">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => void ask(s)}
                      className="border-border/60 hover:bg-accent rounded-lg border px-3 py-1.5 text-left text-xs transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask();
                }
              }}
              placeholder="Ask about using Ecotech…"
              rows={2}
              disabled={sending}
              aria-label="Ask a question about using Ecotech"
              className="max-h-28 resize-none text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-[11px]">Enter to send</span>
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
      )}
    </>
  );
}
