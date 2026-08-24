"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { safeFileName, triggerDownload } from "@/lib/download";

// ============================================
// Downloading a lesson as PowerPoint
//
// A deck is a lesson. Three screens offer the download — the course page, the
// classroom and the instructor's preview — and each had its own copy of the
// fetch, the filename and the error handling. They are here instead, so a
// lesson downloads under the same name wherever the button was pressed.
// ============================================

export interface DownloadableLesson {
  id: string;
  title: string;
}

export interface DownloadLessonOptions {
  /** 1-based position in the course, prefixed to the filename so a folder of
   *  decks still lists in lesson order. */
  position?: number;
}

export function usePptxDownload() {
  /** The lesson currently being exported, so one row can show a spinner. */
  const [downloadingLessonId, setDownloadingLessonId] = useState<string | null>(null);

  const downloadLesson = useCallback(
    async (lesson: DownloadableLesson, options?: DownloadLessonOptions): Promise<boolean> => {
      if (downloadingLessonId) return false;
      setDownloadingLessonId(lesson.id);
      try {
        const res = await fetch("/api/courses/export-pptx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId: lesson.id, deckName: lesson.title }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          toast.error(json?.error || "This lesson has no slides to export yet.");
          return false;
        }
        const prefix =
          options?.position !== undefined ? `${String(options.position).padStart(2, "0")}-` : "";
        triggerDownload(await res.blob(), `${prefix}${safeFileName(lesson.title)}.pptx`);
        toast.success(`“${lesson.title}” downloaded as a PowerPoint file.`);
        return true;
      } catch {
        toast.error("Failed to download this lesson's PPT.");
        return false;
      } finally {
        setDownloadingLessonId(null);
      }
    },
    [downloadingLessonId],
  );

  return { downloadingLessonId, downloadLesson };
}
