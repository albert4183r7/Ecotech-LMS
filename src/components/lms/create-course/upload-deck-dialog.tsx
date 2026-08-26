"use client";

import { useRef, useState } from "react";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MAX_QUIZ_QUESTIONS, MIN_QUIZ_QUESTIONS } from "@/lib/quiz/schema";
import { DEFAULT_QUIZ_QUESTIONS } from "@/lib/slide-styles";

// ============================================
// Upload a deck as a lesson
//
// The other way to add a lesson: an instructor who already has the deck should
// not have to have it written again. The file goes up as it is, and what comes
// back is a lesson whose slides are the ones they made.
//
// The quiz is asked about rather than assumed. Some uploads are reference
// material nobody should be tested on, and generating one anyway would mean an
// instructor deleting a quiz they never wanted.
// ============================================

export interface UploadDeckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the course if it is still a draft, and returns its id. */
  ensureCourseSaved: () => Promise<string | null>;
  /** Called with the new lesson's id once the deck has been imported. */
  onImported: (lessonId: string, slideCount: number, quizRequested: boolean) => void;
}

const MAX_MB = 40;

export function UploadDeckDialog({
  open,
  onOpenChange,
  ensureCourseSaved,
  onImported,
}: UploadDeckDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [wantsQuiz, setWantsQuiz] = useState(true);
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUIZ_QUESTIONS);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setTitle("");
    setWantsQuiz(true);
    setQuestionCount(DEFAULT_QUIZ_QUESTIONS);
  };

  const choose = (chosen: File | null) => {
    if (!chosen) return;
    if (!chosen.name.toLowerCase().endsWith(".pptx")) {
      toast.error("Only .pptx files can be imported. Save the file as .pptx in PowerPoint first.");
      return;
    }
    if (chosen.size > MAX_MB * 1024 * 1024) {
      toast.error(`That deck is larger than ${MAX_MB}MB.`);
      return;
    }
    setFile(chosen);
  };

  const submit = async () => {
    if (!file || importing) return;
    setImporting(true);
    try {
      const courseId = await ensureCourseSaved();
      if (!courseId) {
        toast.error("Save the course details first, then upload the deck.");
        return;
      }

      const body = new FormData();
      body.append("courseId", courseId);
      body.append("file", file);
      body.append("generateQuiz", String(wantsQuiz));
      if (wantsQuiz) body.append("questionCount", String(questionCount));
      if (title.trim()) body.append("title", title.trim());

      const res = await fetch("/api/lessons/import-pptx", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.success) {
        toast.error(json.error || "The deck could not be imported.");
        return;
      }

      const { lessonId, slideCount, hiddenSlides, warnings } = json.data as {
        lessonId: string;
        slideCount: number;
        hiddenSlides: number;
        warnings: string[];
      };

      // Hidden slides are left out on purpose; saying so is the difference
      // between "it worked" and "why are there fewer slides than I sent?".
      const hiddenNote = hiddenSlides
        ? ` ${hiddenSlides} hidden slide${hiddenSlides === 1 ? "" : "s"} left out.`
        : "";

      // Anything the importer could not bring across is said once, here,
      // rather than left for the instructor to notice on slide nine.
      if (warnings.length) {
        toast.warning(
          `${slideCount} slides imported.${hiddenNote} ${warnings.length} thing(s) did not come across: ${warnings[0]}`,
        );
      } else {
        toast.success(`${slideCount} slides imported from ${file.name}.${hiddenNote}`);
      }

      onOpenChange(false);
      reset();
      onImported(lessonId, slideCount, wantsQuiz);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The deck could not be imported.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && importing) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            Upload a deck as a lesson
          </DialogTitle>
          <DialogDescription>
            The slides are kept as you made them. Nothing is rewritten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ---- The file ---- */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">PowerPoint file</Label>
            <input
              ref={inputRef}
              type="file"
              accept=".pptx"
              className="hidden"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="border-border/70 bg-muted/20 flex items-center justify-between rounded-lg border px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-medium">{file.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={importing}
                  onClick={() => setFile(null)}
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="border-border/70 hover:border-primary/60 hover:bg-muted/20 flex w-full flex-col items-center justify-center rounded-lg border border-dashed py-8 transition-colors"
              >
                <Upload className="text-muted-foreground h-5 w-5" />
                <span className="text-foreground mt-2 text-sm font-medium">
                  Choose a .pptx file
                </span>
                <span className="text-muted-foreground text-xs">Up to {MAX_MB}MB</span>
              </button>
            )}
          </div>

          {/* ---- Lesson title ---- */}
          <div className="space-y-2">
            <Label htmlFor="deck-title" className="text-sm font-medium">
              Lesson title
            </Label>
            <Input
              id="deck-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 120))}
              placeholder="Leave blank to use the deck's own title slide"
              disabled={importing}
            />
          </div>

          {/* ---- The quiz, asked rather than assumed ---- */}
          <div className="border-border/70 flex items-start justify-between gap-4 rounded-lg border px-3 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="deck-quiz" className="text-sm font-medium">
                Write a quiz from this deck
              </Label>
              <p className="text-muted-foreground text-xs">
                Questions come only from what these slides say. You review and edit them before the
                course is published.
              </p>
            </div>
            <Switch
              id="deck-quiz"
              checked={wantsQuiz}
              onCheckedChange={setWantsQuiz}
              disabled={importing}
            />
          </div>

          {/* How many, when there is going to be a quiz at all. */}
          {wantsQuiz && (
            <div className="flex items-center justify-between gap-4 px-1">
              <Label htmlFor="deck-questions" className="text-sm font-medium">
                How many questions
              </Label>
              <Input
                id="deck-questions"
                type="number"
                min={MIN_QUIZ_QUESTIONS}
                max={MAX_QUIZ_QUESTIONS}
                value={questionCount}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v)) {
                    setQuestionCount(Math.max(MIN_QUIZ_QUESTIONS, Math.min(MAX_QUIZ_QUESTIONS, v)));
                  }
                }}
                disabled={importing}
                className="h-9 w-20 text-center"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={importing} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!file || importing} className="gap-1.5">
            {importing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <FileUp className="h-3.5 w-3.5" />
                Import deck
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
