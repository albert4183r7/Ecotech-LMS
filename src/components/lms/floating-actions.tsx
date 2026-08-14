"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  LayoutGrid,
  Home,
  ChevronUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useNavigationStore } from "@/stores/lms-store";

/* ------------------------------------------------------------------ */
/*  Quick Action Item                                                  */
/* ------------------------------------------------------------------ */

interface QuickAction {
  icon: React.ReactNode;
  label: string;
  view: "courses" | "create-course" | "dashboard";
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    icon: <Search className="h-4 w-4" />,
    label: "Search Courses",
    view: "courses",
    color: "bg-emerald-500 hover:bg-emerald-600",
  },
  {
    icon: <Plus className="h-4 w-4" />,
    label: "Create Course",
    view: "create-course",
    color: "bg-amber-500 hover:bg-amber-600",
  },
  {
    icon: <Home className="h-4 w-4" />,
    label: "Dashboard",
    view: "dashboard",
    color: "bg-violet-500 hover:bg-violet-600",
  },
];

/* ------------------------------------------------------------------ */
/*  FloatingActions Component                                          */
/* ------------------------------------------------------------------ */

export function FloatingActions() {
  const { navigateTo } = useNavigationStore();
  const [expanded, setExpanded] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  /* Track scroll position for scroll-to-top button */
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  /* Close expanded FAB when clicking outside or navigating */
  useEffect(() => {
    if (!expanded) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-fab-root]")) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [expanded]);

  /* Keyboard: Escape closes FAB */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expanded) setExpanded(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [expanded]);

  const handleActionClick = useCallback(
    (view: QuickAction["view"]) => {
      navigateTo(view);
      setExpanded(false);
    },
    [navigateTo]
  );

  const handleScrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-end px-4 sm:bottom-8 sm:px-8">
      <div className="pointer-events-auto flex flex-col items-end gap-3">
        {/* Expanded action items */}
        <div
          className={cn(
            "flex flex-col items-end gap-2 transition-all duration-300 ease-out",
            expanded
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-4 opacity-0"
          )}
        >
          {QUICK_ACTIONS.map((action, idx) => (
            <Tooltip key={action.label}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleActionClick(action.view)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-200",
                    "hover:scale-105 hover:shadow-xl active:scale-95",
                    "backdrop-blur-md",
                    action.color
                  )}
                  style={{
                    transitionDelay: expanded ? `${idx * 50}ms` : "0ms",
                  }}
                >
                  {action.icon}
                  <span className="hidden sm:inline">{action.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left" className="sm:hidden">
                {action.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Primary FAB */}
        <button
          data-fab-root
          onClick={() => setExpanded((prev) => !prev)}
          className={cn(
            "relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
            "bg-gradient-to-br from-cyan-500 to-teal-600 text-white",
            "hover:scale-110 hover:shadow-xl active:scale-95",
            "backdrop-blur-md",
            "border border-white/20",
            /* Subtle pulse animation when not expanded */
            !expanded && "animate-fab-pulse"
          )}
          aria-label={expanded ? "Close quick actions" : "Open quick actions"}
        >
          <div
            className={cn(
              "transition-transform duration-300",
              expanded && "rotate-45"
            )}
          >
            {expanded ? (
              <X className="h-6 w-6" />
            ) : (
              <Plus className="h-6 w-6" />
            )}
          </div>
        </button>

        {/* Scroll-to-top button */}
        <button
          onClick={handleScrollToTop}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-all duration-300",
            "bg-background/80 text-foreground border border-border/50 backdrop-blur-md",
            "hover:scale-110 active:scale-95",
            showScrollTop
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-4 opacity-0"
          )}
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
