"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ============================================
// Delete course confirmation
//
// Deleting a course takes its lessons, slides, quizzes, enrolments and every
// student's progress with it, so the dialog says so rather than asking a bare
// "are you sure?". Authorization is enforced by the endpoint; this only asks.
// ============================================

export interface DeleteCourseDialogProps {
  course: { id: string; title: string; studentCount?: number } | null;
  onOpenChange: (open: boolean) => void;
  /** Called after the course has actually been deleted. */
  onDeleted: (courseId: string) => void;
}

export function DeleteCourseDialog({ course, onOpenChange, onDeleted }: DeleteCourseDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!course || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/courses/${course.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast.error(json?.error || "Failed to delete the course.");
        return;
      }
      toast.success(`"${course.title}" was deleted.`);
      onDeleted(course.id);
      onOpenChange(false);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const enrolled = course?.studentCount ?? 0;

  return (
    <AlertDialog open={Boolean(course)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Trash2 className="text-destructive h-5 w-5" />
            Delete &ldquo;{course?.title}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This permanently removes the course and everything in it: every lesson, slide and
                quiz, plus all enrolments and student progress.
              </p>
              {enrolled > 0 && (
                <p className="text-destructive font-medium">
                  {enrolled} student{enrolled === 1 ? " is" : "s are"} enrolled. Their progress will
                  be lost.
                </p>
              )}
              <p>This cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Deletion is async; the dialog closes when it succeeds.
              e.preventDefault();
              handleDelete();
            }}
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete course"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
