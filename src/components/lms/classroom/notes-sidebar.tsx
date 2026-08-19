"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bookmark, BookmarkCheck, Loader2, Send, StickyNote, Trash2 } from "lucide-react";

export interface NotesSidebarContentProps {
  notes: {
    id: string;
    content: string;
    slideNumber: number;
    bookmarked: boolean;
    createdAt?: string;
  }[];
  currentLessonIndex: number;
  newNoteContent: string;
  savingNote: boolean;
  onContentChange: (v: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onToggleBookmark: (id: string) => void;
  endRef: React.RefObject<HTMLDivElement | null>;
}
export function NotesSidebarContent({
  notes,
  currentLessonIndex,
  newNoteContent,
  savingNote,
  onContentChange,
  onCreate,
  onDelete,
  onToggleBookmark,
  endRef,
}: NotesSidebarContentProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onCreate();
    }
  };

  return (
    <>
      {/* Notes List */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-2 p-3">
          {notes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <StickyNote className="text-muted-foreground/30 mb-2 h-8 w-8" />
              <p className="text-muted-foreground text-xs">No notes yet.</p>
              <p className="text-muted-foreground/60 text-xs">
                Add a note for lesson {currentLessonIndex + 1}.
              </p>
            </div>
          )}
          {notes.map((note) => (
            <div
              key={note.id}
              className="group bg-background hover:bg-muted/40 relative rounded-lg border p-3 text-sm transition-colors"
            >
              {/* Slide badge */}
              <div className="mb-1 flex items-center justify-between">
                <span className="bg-primary/10 text-primary inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                  Slide {note.slideNumber}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    className="hover:bg-muted rounded p-1 transition-colors"
                    onClick={() => onToggleBookmark(note.id)}
                    aria-label={note.bookmarked ? "Remove bookmark" : "Bookmark note"}
                  >
                    {note.bookmarked ? (
                      <BookmarkCheck className="h-3.5 w-3.5 text-amber-500" />
                    ) : (
                      <Bookmark className="text-muted-foreground h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className="hover:bg-destructive/10 rounded p-1 transition-colors"
                    onClick={() => onDelete(note.id)}
                    aria-label="Delete note"
                  >
                    <Trash2 className="text-muted-foreground hover:text-destructive h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-foreground/80 text-xs leading-relaxed whitespace-pre-line">
                {note.content}
              </p>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* New Note Input */}
      <div className="shrink-0 border-t p-3">
        <div className="flex gap-2">
          <textarea
            value={newNoteContent}
            onChange={(e) => onContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Add a note for lesson ${currentLessonIndex + 1}…`}
            rows={2}
            className="bg-background placeholder:text-muted-foreground/50 focus:ring-primary/20 flex-1 resize-none rounded-lg border px-3 py-2 text-xs focus:ring-2 focus:outline-none"
          />
          <Button
            size="icon"
            className="h-auto w-9 shrink-0 self-end"
            onClick={onCreate}
            disabled={savingNote || !newNoteContent.trim()}
          >
            {savingNote ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </>
  );
}

// ============================================
// Confetti Celebration Component
// ============================================

/** LMS color palette for confetti particles */
