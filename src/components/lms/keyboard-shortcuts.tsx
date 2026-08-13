"use client";

import { useState, useEffect, useCallback } from "react";
import { Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useNavigationStore } from "@/stores/lms-store";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────

/** A single keyboard shortcut entry */
interface ShortcutItem {
  /** Key labels to display (e.g. ["?", "Ctrl+K"]) */
  keys: string[];
  /** Human-readable description of what the shortcut does */
  description: string;
}

/** A named group of related shortcuts */
interface ShortcutGroup {
  /** Group heading shown in the dialog */
  title: string;
  /** Shortcuts belonging to this group */
  shortcuts: ShortcutItem[];
}

// ─── Shortcut Definitions ───────────────────────────────────────

/** All keyboard shortcuts grouped by category */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["?", "Ctrl+K"], description: "Toggle this help dialog" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["H"], description: "Go to Home" },
      { keys: ["C"], description: "Go to Courses" },
      { keys: ["M"], description: "Go to My Learning" },
      { keys: ["P"], description: "Go to Profile" },
      { keys: ["N"], description: "Create New Course" },
      { keys: ["Esc"], description: "Go Back" },
    ],
  },
  {
    title: "Classroom",
    shortcuts: [
      { keys: ["←", "→"], description: "Previous / Next Slide" },
      { keys: ["Space"], description: "Next Slide" },
      { keys: ["Esc"], description: "Go Back" },
    ],
  },
];

// ─── Sub-components ──────────────────────────────────────────────

/** Styled keyboard key cap */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center",
        "min-w-[1.75rem] h-7 px-2",
        "rounded-md border border-border",
        "bg-muted/60 text-xs font-mono font-medium text-foreground",
        "shadow-[0_1px_0_1px_oklch(0.80_0.02_200)]",
        "dark:shadow-[0_1px_0_1px_oklch(0.25_0.02_250)]",
        "select-none"
      )}
    >
      {children}
    </kbd>
  );
}

/** A single shortcut row */
function ShortcutRow({ shortcut }: { shortcut: ShortcutItem }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{shortcut.description}</span>
      <div className="flex items-center gap-1.5 shrink-0">
        {shortcut.keys.map((key, i) => (
          <span key={key} className="flex items-center gap-1.5">
            <Kbd>{key}</Kbd>
            {i < shortcut.keys.length - 1 && (
              <span className="text-xs text-muted-foreground/60">or</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A group of shortcuts with a heading */
function ShortcutGroupSection({ group }: { group: ShortcutGroup }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-primary/80 mb-2">
        {group.title}
      </h3>
      <div className="space-y-0.5">
        {group.shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.description} shortcut={shortcut} />
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);
  const { navigateTo, goBack, currentView } = useNavigationStore();

  const isInClassroom = currentView === "classroom";

  /** Toggle the help dialog open/closed */
  const toggleDialog = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  // ─── Global keyboard event listener ──────────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isInInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // ── Dialog toggle (works even when dialog is open) ──
      if (e.key === "?" && !isInInput) {
        e.preventDefault();
        toggleDialog();
        return;
      }
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleDialog();
        return;
      }

      // Skip all other shortcuts when dialog is open or focus is in an input
      if (open || isInInput) return;

      // ── Navigation shortcuts (not available in classroom) ──
      if (!isInClassroom) {
        switch (e.key.toLowerCase()) {
          case "h":
            e.preventDefault();
            navigateTo("home");
            return;
          case "c":
            e.preventDefault();
            navigateTo("courses");
            return;
          case "m":
            e.preventDefault();
            navigateTo("my-learning");
            return;
          case "p":
            e.preventDefault();
            navigateTo("profile");
            return;
          case "n":
            e.preventDefault();
            navigateTo("create-course");
            return;
        }
      }

      // ── Classroom slide shortcuts ──
      if (isInClassroom) {
        if (e.key === " ") {
          e.preventDefault();
          // Dispatch custom event so the classroom page can react
          window.dispatchEvent(new CustomEvent("lms:next-slide"));
          return;
        }
      }

      // ── Global Escape: go back (classroom handles its own Esc) ──
      if (e.key === "Escape" && !isInClassroom) {
        goBack();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isInClassroom, navigateTo, goBack, toggleDialog]);

  return (
    <>
      {/* ── Floating trigger button (bottom-right) ── */}
      <button
        type="button"
        onClick={toggleDialog}
        aria-label="Keyboard shortcuts"
        className={cn(
          "fixed bottom-6 right-6 z-40",
          "flex h-10 w-10 items-center justify-center",
          "rounded-full bg-primary text-primary-foreground",
          "shadow-md hover:shadow-lg",
          "transition-all duration-200 hover:scale-105 active:scale-95",
          "pulse-glow"
        )}
      >
        <Keyboard className="h-5 w-5" />
      </button>

      {/* ── Keyboard Shortcuts Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Keyboard className="h-5 w-5" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Use these shortcuts to navigate quickly around OpenClass.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-2">
            {SHORTCUT_GROUPS.map((group) => (
              <ShortcutGroupSection key={group.title} group={group} />
            ))}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-center gap-2 pt-2 border-t border-border/60">
            <Kbd>?</Kbd>
            <span className="text-xs text-muted-foreground">
              to toggle this dialog anytime
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
