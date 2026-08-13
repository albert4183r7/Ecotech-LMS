"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { Clock, Search, BookOpen, FolderOpen, X, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { CourseItem, CategoryItem } from "@/types/lms";

// ============================================
// Constants
// ============================================
const RECENT_SEARCHES_KEY = "openclass_recent_searches";
const MAX_RECENT = 5;
const MAX_COURSE_SUGGESTIONS = 3;
const MAX_CATEGORY_SUGGESTIONS = 3;

// ============================================
// Helpers
// ============================================

function getRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(term: string) {
  if (typeof window === "undefined") return;
  const trimmed = term.trim();
  if (!trimmed) return;
  const existing = getRecentSearches();
  const filtered = existing.filter((s) => s.toLowerCase() !== trimmed.toLowerCase());
  const updated = [trimmed, ...filtered].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

function clearRecentSearches() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

function matchCourses(query: string, courses: CourseItem[]): CourseItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return courses
    .filter((c) => c.title.toLowerCase().includes(q))
    .slice(0, MAX_COURSE_SUGGESTIONS);
}

function matchCategories(
  query: string,
  categories: CategoryItem[]
): CategoryItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return categories
    .filter((c) => c.name.toLowerCase().includes(q))
    .slice(0, MAX_CATEGORY_SUGGESTIONS);
}

/** Highlight the matching portion of text */
function HighlightMatch({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query.trim()) return <>{text}</>;
  const q = query.trim();
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-primary">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  );
}

// ============================================
// Suggestion Item
// ============================================
function SuggestionItem({
  icon,
  label,
  sublabel,
  query,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  query: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-foreground">
          <HighlightMatch text={label} query={query} />
        </p>
        {sublabel && (
          <p className="truncate text-xs text-muted-foreground">{sublabel}</p>
        )}
      </div>
    </button>
  );
}

// ============================================
// Section Header
// ============================================
function SectionHeader({
  icon,
  label,
  action,
}: {
  icon: ReactNode;
  label: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-3 pt-2 pb-1">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      {action}
    </div>
  );
}

// ============================================
// Main Component
// ============================================
interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (value: string) => void;
  placeholder?: string;
  className?: string;
  courses: CourseItem[];
  categories: CategoryItem[];
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

export function SearchAutocomplete({
  value,
  onChange,
  onSearch,
  placeholder = "Search courses...",
  className,
  courses,
  categories,
  inputRef: externalInputRef,
}: SearchAutocompleteProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalRef;
  const containerRef = useRef<HTMLDivElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());
  const [animating, setAnimating] = useState(false);

  // ── Animation helpers (declared before useEffects that reference them) ──
  const closeDropdown = useCallback(() => {
    setAnimating(false);
    // Wait for animation to complete before removing from DOM
    setTimeout(() => {
      setIsOpen(false);
    }, 150);
  }, []);

  const openDropdown = useCallback(() => {
    setRecentSearches(getRecentSearches());
    setIsOpen(true);
    setAnimating(true);
  }, []);

  // ── Compute suggestions ──────────────────────────────────────────
  const matchedCourses = matchCourses(value, courses);
  const matchedCategories = matchCategories(value, categories);

  // Filter recent searches to only show those not matching current input exactly
  const filteredRecent = value.trim()
    ? recentSearches.filter((s) =>
        s.toLowerCase().includes(value.trim().toLowerCase())
      )
    : recentSearches;

  const hasContent =
    filteredRecent.length > 0 || matchedCourses.length > 0 || matchedCategories.length > 0;

  // ── Close dropdown on outside click ───────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [closeDropdown]);

  // ── Close dropdown on Escape ──────────────────────────────────────
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        closeDropdown();
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", handleEscape, true);
    return () => document.removeEventListener("keydown", handleEscape, true);
  }, [isOpen, inputRef, closeDropdown]);

  // ── Select a suggestion ───────────────────────────────────────────
  function selectSuggestion(term: string) {
    onChange(term);
    saveRecentSearch(term);
    onSearch(term);
    closeDropdown();
    inputRef.current?.blur();
  }

  // ── Handle input change ───────────────────────────────────────────
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    onChange(newValue);
    if (!isOpen) openDropdown();
  }

  // ── Handle key down ───────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      saveRecentSearch(value);
      onSearch(value);
      closeDropdown();
    }
    // Don't stop propagation for other keys to allow parent handlers
  }

  // ── Handle focus ──────────────────────────────────────────────────
  function handleFocus() {
    openDropdown();
  }

  // ── Handle clear recent searches ──────────────────────────────────
  function handleClearRecent(e: React.MouseEvent) {
    e.stopPropagation();
    clearRecentSearches();
    setRecentSearches([]);
  }

  // ── Handle input clear (X button) ─────────────────────────────────
  function handleClear() {
    onChange("");
    onSearch("");
    inputRef.current?.focus();
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          className="pl-9 pr-9"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-border bg-popover shadow-lg",
            "transition-all duration-150 ease-out",
            animating
              ? "translate-y-0 opacity-100"
              : "translate-y-1 opacity-0"
          )}
        >
          {hasContent ? (
            <ScrollArea className="max-h-80">
              <div className="p-1.5">
                {/* Recent Searches */}
                {filteredRecent.length > 0 && (
                  <>
                    <SectionHeader
                      icon={<Clock className="h-3 w-3" />}
                      label="Recent"
                      action={
                        <button
                          type="button"
                          onClick={handleClearRecent}
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                          Clear
                        </button>
                      }
                    />
                    {filteredRecent.map((term) => (
                      <SuggestionItem
                        key={`recent-${term}`}
                        icon={<Clock className="h-4 w-4" />}
                        label={term}
                        query={value}
                        onClick={() => selectSuggestion(term)}
                      />
                    ))}
                  </>
                )}

                {/* Separator between recent and suggestions */}
                {filteredRecent.length > 0 &&
                  (matchedCourses.length > 0 || matchedCategories.length > 0) && (
                    <Separator className="my-1.5" />
                  )}

                {/* Suggested Courses */}
                {matchedCourses.length > 0 && (
                  <>
                    <SectionHeader
                      icon={<BookOpen className="h-3 w-3" />}
                      label="Courses"
                    />
                    {matchedCourses.map((course) => (
                      <SuggestionItem
                        key={`course-${course.id}`}
                        icon={<BookOpen className="h-4 w-4" />}
                        label={course.title}
                        sublabel={course.category?.name}
                        query={value}
                        onClick={() => selectSuggestion(course.title)}
                      />
                    ))}
                  </>
                )}

                {/* Separator between courses and categories */}
                {matchedCourses.length > 0 && matchedCategories.length > 0 && (
                  <Separator className="my-1.5" />
                )}

                {/* Suggested Categories */}
                {matchedCategories.length > 0 && (
                  <>
                    <SectionHeader
                      icon={<FolderOpen className="h-3 w-3" />}
                      label="Categories"
                    />
                    {matchedCategories.map((cat) => (
                      <SuggestionItem
                        key={`cat-${cat.id}`}
                        icon={<FolderOpen className="h-4 w-4" />}
                        label={cat.name}
                        sublabel={
                          cat._count
                            ? `${cat._count.courses} course${cat._count.courses !== 1 ? "s" : ""}`
                            : undefined
                        }
                        query={value}
                        onClick={() => selectSuggestion(cat.name)}
                      />
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {value.trim()
                  ? "No matching suggestions"
                  : "Start typing to search"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
