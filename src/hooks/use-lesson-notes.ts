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
        `/api/notes?userId=${userId}&courseId=${courseId}&lessonId=${lessonId}`,
      );
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) setNotes(json.data);
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
        setNotes((prev) => [...prev, json.data]);
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

  const toggleBookmark = useCallback((noteId: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, bookmarked: !n.bookmarked } : n)),
    );
  }, []);

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
