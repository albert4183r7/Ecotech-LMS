"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ============================================
// Notes for the lesson currently open in the classroom
// ============================================

export interface LessonNote {
  id: string;
  content: string;
  slideNumber: number;
  bookmarked: boolean;
  createdAt?: string;
}

interface NoteResponse extends Omit<LessonNote, "bookmarked"> {
  isBookmarked?: boolean;
  bookmarked?: boolean;
}

function toLessonNote(note: NoteResponse): LessonNote {
  return { ...note, bookmarked: note.isBookmarked ?? note.bookmarked ?? false };
}

interface UseLessonNotesArgs {
  userId: string;
  courseId: string | undefined;
  lessonId: string | undefined;
  slideNumber: number;
  /** Only fetch while the sidebar is open. */
  enabled: boolean;
}

export function useLessonNotes({
  userId,
  courseId,
  lessonId,
  slideNumber,
  enabled,
}: UseLessonNotesArgs) {
  const [notes, setNotes] = useState<LessonNote[]>([]);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const notesEndRef = useRef<HTMLDivElement>(null);

  const fetchNotes = useCallback(async () => {
    if (!userId || !courseId || !lessonId) return;
    try {
      const res = await fetch(
        `/api/notes?courseId=${encodeURIComponent(courseId)}&lessonId=${encodeURIComponent(lessonId)}`,
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setNotes(json.data.map(toLessonNote));
    } catch {
      // Notes are supplementary; a failed load should not disrupt the lesson.
    }
  }, [userId, courseId, lessonId]);

  useEffect(() => {
    if (enabled) fetchNotes();
  }, [enabled, fetchNotes]);

  const createNote = useCallback(async () => {
    if (!userId || !courseId || !lessonId || !newNoteContent.trim()) return;
    setSavingNote(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          courseId,
          lessonId,
          content: newNoteContent.trim(),
          slideNumber,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && json.data) {
        setNotes((prev) => [...prev, toLessonNote(json.data)]);
        setNewNoteContent("");
        setTimeout(() => notesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      }
    } catch {
      toast.error("Failed to save note");
    } finally {
      setSavingNote(false);
    }
  }, [userId, courseId, lessonId, newNoteContent, slideNumber]);

  const deleteNote = useCallback(async (noteId: string) => {
    try {
      const res = await fetch(`/api/notes?id=${noteId}`, { method: "DELETE" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      // Same as above — non-critical.
    }
  }, []);

  const toggleBookmark = useCallback(async (noteId: string) => {
    const current = notes.find((note) => note.id === noteId);
    if (!current) return;
    const bookmarked = !current.bookmarked;
    setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, bookmarked } : n)));
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: noteId, isBookmarked: bookmarked }),
      });
      if (!res.ok) throw new Error("bookmark update failed");
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "bookmark update failed");
      setNotes((prev) => prev.map((n) => (n.id === noteId ? toLessonNote(json.data) : n)));
    } catch {
      setNotes((prev) =>
        prev.map((n) => (n.id === noteId ? { ...n, bookmarked: current.bookmarked } : n)),
      );
      toast.error("Failed to update bookmark");
    }
  }, [notes]);

  return {
    notes,
    newNoteContent,
    setNewNoteContent,
    savingNote,
    notesEndRef,
    createNote,
    deleteNote,
    toggleBookmark,
  };
}
