"use client";

import { GraduationCap } from "lucide-react";

/** Sticky footer component for the LMS application */
export function Footer() {
  return (
    <footer className="mt-auto border-t border-border/60 bg-card/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
          {/* Brand */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GraduationCap className="h-4 w-4 text-primary/60" />
            <span className="font-medium">OpenClass</span>
            <span className="hidden sm:inline text-muted-foreground/60">
              &middot; Internal Training Platform
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground/70">
            <span>&copy; {new Date().getFullYear()}</span>
            <span className="hidden sm:inline">Built for teams that learn together</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
