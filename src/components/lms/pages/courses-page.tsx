"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CourseCard } from "@/components/lms/course-card";
import { useCourseStore } from "@/stores/lms-store";
import type { CourseFilters, CourseItem, CategoryItem } from "@/types/lms";
import { cn } from "@/lib/utils";

// ============================================
// Filter option types
// ============================================
interface FilterOption {
  label: string;
  value: string;
}

const SORT_OPTIONS: FilterOption[] = [
  { label: "Newest", value: "newest" },
  { label: "Most Students", value: "most_students" },
  { label: "Alphabetical", value: "alphabetical" },
  { label: "Rating", value: "rating" },
];

const TIME_RANGE_OPTIONS: FilterOption[] = [
  { label: "All Time", value: "all" },
  { label: "Last Week", value: "week" },
  { label: "Last Month", value: "month" },
];

// ============================================
// Skeleton Loader Components
// ============================================
function FilterSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-4 w-20" />
          <div className="space-y-2">
            {Array.from({ length: 3 + i }).map((_, j) => (
              <Skeleton key={j} className="h-8 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CourseGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-border/50">
          <Skeleton className="aspect-video w-full" />
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// Filter Button Component
// ============================================
function FilterButton({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <span>{label}</span>
      {count !== undefined && (
        <Badge
          variant={active ? "secondary" : "outline"}
          className="ml-2 text-[10px] px-1.5 py-0"
        >
          {count}
        </Badge>
      )}
    </button>
  );
}

// ============================================
// Filter Sidebar Content (shared between desktop & mobile Sheet)
// ============================================
function FilterSidebarContent({
  categories,
  filters,
  onFilterChange,
}: {
  categories: CategoryItem[];
  filters: CourseFilters;
  onFilterChange: (filters: Partial<CourseFilters>) => void;
}) {
  return (
    <ScrollArea className="h-[calc(100vh-8rem)]">
      <div className="space-y-6 p-4">
        {/* Category Filter */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Category</h3>
          <div className="space-y-1">
            <FilterButton
              label="All"
              active={filters.category === "all"}
              onClick={() => onFilterChange({ category: "all" })}
              count={categories.reduce((sum, c) => sum + (c._count?.courses ?? 0), 0)}
            />
            {categories.map((cat) => (
              <FilterButton
                key={cat.id}
                label={cat.name}
                active={filters.category === cat.id}
                onClick={() => onFilterChange({ category: cat.id })}
                count={cat._count?.courses ?? 0}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Sort By */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Sort By</h3>
          <div className="space-y-1">
            {SORT_OPTIONS.map((opt) => (
              <FilterButton
                key={opt.value}
                label={opt.label}
                active={filters.sortBy === opt.value}
                onClick={() =>
                  onFilterChange({
                    sortBy: opt.value as CourseFilters["sortBy"],
                  })
                }
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Time Range */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Time Range</h3>
          <div className="space-y-1">
            {TIME_RANGE_OPTIONS.map((opt) => (
              <FilterButton
                key={opt.value}
                label={opt.label}
                active={filters.timeRange === opt.value}
                onClick={() =>
                  onFilterChange({
                    timeRange: opt.value as CourseFilters["timeRange"],
                  })
                }
              />
            ))}
          </div>
        </div>

        {/* Reset Filters */}
        <Separator />
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            onFilterChange({
              category: "all",
              sortBy: "newest",
              timeRange: "all",
              search: "",
            })
          }
        >
          <X className="mr-2 h-3.5 w-3.5" />
          Reset Filters
        </Button>
      </div>
    </ScrollArea>
  );
}

// ============================================
// Main Courses Page Component
// ============================================
export function CoursesPage() {
  const { courses, categories, courseFilters, setCourses, setCategories, setCourseFilters } =
    useCourseStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------- Fetch categories ----------
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch("/api/categories");
        const json = await res.json();
        if (json.success) {
          setCategories(json.data);
        }
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      }
    }
    fetchCategories();
  }, [setCategories]);

  // ---------- Fetch courses based on filters ----------
  const fetchCourses = useCallback(async (filters: CourseFilters) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.category && filters.category !== "all") {
        params.set("category", filters.category);
      }
      if (filters.sortBy && filters.sortBy !== "newest") {
        params.set("sortBy", filters.sortBy);
      }
      if (filters.timeRange && filters.timeRange !== "all") {
        params.set("timeRange", filters.timeRange);
      }
      if (filters.search && filters.search.trim()) {
        params.set("search", filters.search.trim());
      }

      const queryStr = params.toString();
      const url = queryStr ? `/api/courses?${queryStr}` : "/api/courses";
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setCourses(json.data as CourseItem[]);
      }
    } catch (err) {
      console.error("Failed to fetch courses:", err);
    } finally {
      setIsLoading(false);
    }
  }, [setCourses]);

  // ---------- Re-fetch courses whenever non-search filters change ----------
  useEffect(() => {
    fetchCourses(courseFilters);
  }, [courseFilters.category, courseFilters.sortBy, courseFilters.timeRange, fetchCourses]);

  // ---------- Debounced search ----------
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchCourses(courseFilters);
    }, 300);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [courseFilters.search, fetchCourses]);

  // ---------- Handler for filter changes ----------
  const handleFilterChange = useCallback(
    (partial: Partial<CourseFilters>) => {
      setCourseFilters(partial);
    },
    [setCourseFilters]
  );

  // ---------- Active filter count for mobile badge ----------
  const activeFilterCount = [
    courseFilters.category !== "all",
    courseFilters.sortBy !== "newest",
    courseFilters.timeRange !== "all",
    !!courseFilters.search.trim(),
  ].filter(Boolean).length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Courses
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Explore our library of courses and start learning today.
        </p>
      </div>

      <div className="flex gap-6">
        {/* ============================================ */}
        {/* Desktop Sidebar */}
        {/* ============================================ */}
        <aside className="hidden w-64 shrink-0 md:block">
          <div className="sticky top-20 rounded-xl border border-border bg-card">
            {categories.length === 0 ? (
              <FilterSkeleton />
            ) : (
              <FilterSidebarContent
                categories={categories}
                filters={courseFilters}
                onFilterChange={handleFilterChange}
              />
            )}
          </div>
        </aside>

        {/* ============================================ */}
        {/* Main Content */}
        {/* ============================================ */}
        <main className="min-w-0 flex-1">
          {/* Search Bar & Mobile Filter Toggle */}
          <div className="mb-6 flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                type="text"
                placeholder="Search courses..."
                value={courseFilters.search}
                onChange={(e) => handleFilterChange({ search: e.target.value })}
                className="pl-9 h-10"
              />
              {courseFilters.search && (
                <button
                  type="button"
                  onClick={() => {
                    handleFilterChange({ search: "" });
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Mobile Filter Button */}
            <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="md:hidden relative shrink-0">
                  <SlidersHorizontal className="h-4 w-4" />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b border-border px-4 py-3">
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                {categories.length === 0 ? (
                  <FilterSkeleton />
                ) : (
                  <FilterSidebarContent
                    categories={categories}
                    filters={courseFilters}
                    onFilterChange={(partial) => {
                      handleFilterChange(partial);
                    }}
                  />
                )}
              </SheetContent>
            </Sheet>
          </div>

          {/* Active Filters Pills (desktop) */}
          <div className="mb-4 hidden flex-wrap items-center gap-2 md:flex">
            {courseFilters.category !== "all" && (
              <Badge
                variant="secondary"
                className="cursor-pointer gap-1 pr-1"
                onClick={() => handleFilterChange({ category: "all" })}
              >
                Category: {categories.find((c) => c.id === courseFilters.category)?.name ?? courseFilters.category}
                <X className="h-3 w-3" />
              </Badge>
            )}
            {courseFilters.sortBy !== "newest" && (
              <Badge
                variant="secondary"
                className="cursor-pointer gap-1 pr-1"
                onClick={() => handleFilterChange({ sortBy: "newest" })}
              >
                Sort: {SORT_OPTIONS.find((o) => o.value === courseFilters.sortBy)?.label}
                <X className="h-3 w-3" />
              </Badge>
            )}
            {courseFilters.timeRange !== "all" && (
              <Badge
                variant="secondary"
                className="cursor-pointer gap-1 pr-1"
                onClick={() => handleFilterChange({ timeRange: "all" })}
              >
                Time: {TIME_RANGE_OPTIONS.find((o) => o.value === courseFilters.timeRange)?.label}
                <X className="h-3 w-3" />
              </Badge>
            )}
          </div>

          {/* Results Count */}
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Found{" "}
              <span className="font-semibold text-foreground">
                {isLoading ? "..." : courses.length}
              </span>{" "}
              courses
            </p>
          </div>

          {/* Course Grid */}
          {isLoading ? (
            <CourseGridSkeleton />
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Search className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                No courses found
              </h3>
              <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
                Try adjusting your filters or search terms to find what you&apos;re looking for.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() =>
                  handleFilterChange({
                    category: "all",
                    sortBy: "newest",
                    timeRange: "all",
                    search: "",
                  })
                }
              >
                Clear all filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
