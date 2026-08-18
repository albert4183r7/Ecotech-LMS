"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonCard } from "@/components/lms/skeleton-cards";
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
import { SearchAutocomplete } from "@/components/lms/search-autocomplete";
import { useCourseStore } from "@/stores/lms-store";
import type { CourseFilters, CategoryItem } from "@/types/lms";
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
        <div
          key={i}
          className="opacity-0"
          style={{
            animation: `viewFadeSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) ${i * 60}ms forwards`,
          }}
        >
          <SkeletonCard lines={2} showImage />
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
          setCategories(
            json.data.map((c: Record<string, unknown>) => ({
              id: c.id as string,
              name: c.name as string,
              description: (c.description as string) ?? null,
              color: (c.color as string) ?? null,
              _count: { courses: (c.coursesCount as number) ?? 0 },
            }))
          );
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
        setCourses(
          (json.data as Array<Record<string, unknown>>).map((c) => ({
            id: c.id as string,
            title: c.title as string,
            description: (c.description as string) ?? null,
            coverImage: (c.coverImage as string) ?? null,
            rating: (c.rating as number) ?? 0,
            studentCount: (c.studentCount as number) ?? 0,
            status: (c.status as string) ?? "published",
            language: (c.language as string) ?? "english",
            category: c.category
              ? {
                  id: (c.category as Record<string, unknown>).id as string,
                  name: (c.category as Record<string, unknown>).name as string,
                  color: ((c.category as Record<string, unknown>).color as string) ?? null,
                }
              : null,
            lessons: [],
            createdAt: (c.createdAt as string) ?? "",
            updatedAt: (c.updatedAt as string) ?? "",
          }))
        );
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
          {/* Search Bar & Results Count & Mobile Filter Toggle */}
          <div className="mb-4 flex items-center gap-3">
            <SearchAutocomplete
              value={courseFilters.search}
              onChange={(val) => handleFilterChange({ search: val })}
              onSearch={(val) => handleFilterChange({ search: val })}
              placeholder="Search courses..."
              courses={courses}
              categories={categories}
              inputRef={searchInputRef}
              className="flex-1"
            />

            {/* Results count — inline with search */}
            <span className="hidden shrink-0 text-sm text-muted-foreground sm:inline">
              <span className="font-semibold text-foreground">
                {isLoading ? "..." : courses.length}
              </span>{" "}
              courses found
            </span>

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

          {/* Mobile results count */}
          <div className="mb-3 sm:hidden">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">
                {isLoading ? "..." : courses.length}
              </span>{" "}
              courses found
            </p>
          </div>

          {/* Category Filter Pills */}
          {categories.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleFilterChange({ category: "all" })}
                className={cn(
                  "hover-lift inline-flex items-center rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
                  courseFilters.category === "all"
                    ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-sm shadow-teal-500/20"
                    : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                )}
              >
                All
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    handleFilterChange({
                      category: courseFilters.category === cat.id ? "all" : cat.id,
                    })
                  }
                  className={cn(
                    "hover-lift inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200",
                    courseFilters.category === cat.id
                      ? "bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-sm shadow-teal-500/20"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  {cat.name}
                  <span className={cn(
                    "text-[10px] tabular-nums",
                    courseFilters.category === cat.id
                      ? "text-white/80"
                      : "text-muted-foreground/60"
                  )}>
                    {cat._count?.courses ?? 0}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Active Non-Category Filters Pills (desktop) */}
          <div className="mb-4 hidden flex-wrap items-center gap-2 md:flex">
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

          {/* Course Grid */}
          {isLoading ? (
            <CourseGridSkeleton />
          ) : courses.length === 0 ? (
            <div className="empty-state flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16">
              <div className="empty-illustration flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10">
                <Search className="h-7 w-7 text-primary" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-foreground">
                No courses found
              </h3>
              <p className="mt-1.5 max-w-sm text-center text-sm text-muted-foreground leading-relaxed">
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
              {courses.map((course, i) => (
                <div key={course.id} className="stagger-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <CourseCard course={course} index={i} />
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
