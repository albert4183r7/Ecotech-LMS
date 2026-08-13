"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Sparkles, BookOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CourseCard } from "@/components/lms/course-card";
import { useNavigationStore, useCourseStore } from "@/stores/lms-store";
import type { CourseItem, CategoryItem, HomeTab } from "@/types/lms";

/** Shape returned by /api/courses */
interface CourseApiResponse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  studentCount: number;
  status: string;
  language: string;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; description?: string | null; color?: string | null } | null;
  sectionsCount?: number;
  enrollmentsCount?: number;
}

/** Map API response to CourseItem for use with CourseCard */
function mapCourseResponse(c: CourseApiResponse): CourseItem {
  return {
    ...c,
    category: c.category
      ? { id: c.category.id, name: c.category.name, color: c.category.color ?? null }
      : null,
    creator: null,
    sections: [],
    _count: {
      enrollments: c.enrollmentsCount ?? 0,
      favorites: 0,
    },
  };
}

const TABS: { key: HomeTab; label: string }[] = [
  { key: "hot", label: "Hot" },
  { key: "new", label: "New" },
  { key: "recommended", label: "Recommended" },
];

export function HomePage() {
  const { navigateTo } = useNavigationStore();
  const { homeTab, categories, courses, setCategories, setCourses, setHomeTab, courseFilters, setCourseFilters } =
    useCourseStore();

  const [searchInput, setSearchInput] = useState(courseFilters.search);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [createPrompt, setCreatePrompt] = useState("");

  // ── Fetch categories ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function fetchCategories() {
      try {
        const res = await fetch("/api/categories");
        const json = await res.json();
        if (!cancelled && json.success) {
          const items: CategoryItem[] = json.data.map((c: { id: string; name: string; description?: string | null; color?: string | null; coursesCount: number }) => ({
            id: c.id,
            name: c.name,
            description: c.description ?? null,
            color: c.color ?? null,
            _count: { courses: c.coursesCount },
          }));
          setCategories(items);
        }
      } catch (err) {
        console.error("Failed to fetch categories", err);
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    }

    fetchCategories();
    return () => {
      cancelled = true;
    };
  }, [setCategories]);

  // ── Fetch courses based on tab / category / search ─────────────────
  const fetchCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const params = new URLSearchParams();
      params.set("tab", homeTab);

      if (courseFilters.category && courseFilters.category !== "all") {
        params.set("category", courseFilters.category);
      }
      if (courseFilters.search) {
        params.set("search", courseFilters.search);
      }

      const res = await fetch(`/api/courses?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setCourses(json.data.map(mapCourseResponse));
      }
    } catch (err) {
      console.error("Failed to fetch courses", err);
    } finally {
      setLoadingCourses(false);
    }
  }, [homeTab, courseFilters.category, courseFilters.search, setCourses]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // ── Handlers ───────────────────────────────────────────────────────
  function handleTabChange(tab: HomeTab) {
    setHomeTab(tab);
  }

  function handleCategorySelect(categoryId: string) {
    setCourseFilters({ category: categoryId });
  }

  function handleSearch() {
    setCourseFilters({ search: searchInput });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  function handleCreateCourse() {
    navigateTo("create-course");
  }

  // ── Render helpers ─────────────────────────────────────────────────
  const totalCourseCount = categories.reduce((sum, c) => sum + (c._count?.courses ?? 0), 0);

  return (
    <div className="flex flex-col">
      {/* ─── Hero Banner ─────────────────────────────────────────── */}
      <section className="hero-gradient px-4 py-10 sm:px-6 sm:py-14 md:px-8 lg:px-12">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl">
            Create Your Course
          </h1>
          <p className="mt-2 text-sm text-white/80 sm:text-base md:mt-3">
            Harness AI to build engaging courses in minutes — generate content, structure, and visuals effortlessly.
          </p>

          {/* Create prompt input */}
          <div className="mt-6 flex items-center gap-2 sm:mt-8">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
              <input
                type="text"
                placeholder="Describe your course idea..."
                value={createPrompt}
                onChange={(e) => setCreatePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCourse();
                }}
                className="h-11 w-full rounded-lg border border-white/20 bg-white/10 pl-10 pr-4 text-sm text-white placeholder:text-white/50 backdrop-blur-sm transition-colors focus:border-white/40 focus:outline-none focus:ring-1 focus:ring-white/30 sm:h-12 sm:text-base"
              />
            </div>
            <Button
              onClick={handleCreateCourse}
              className="h-11 shrink-0 rounded-lg bg-white px-5 font-medium text-primary hover:bg-white/90 sm:h-12 sm:px-6"
            >
              Try Create
            </Button>
          </div>

          {/* Tab buttons */}
          <div className="mt-6 flex items-center justify-center gap-1 sm:mt-8">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:px-5 sm:py-2 sm:text-base ${
                  homeTab === tab.key
                    ? "bg-white text-primary shadow-sm"
                    : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Content Area: Sidebar + Course Grid ──────────────────── */}
      <section className="flex flex-1 gap-6 px-4 py-6 sm:px-6 md:px-8 lg:px-12">
        {/* ── Desktop Category Sidebar ─────────────────────────────── */}
        <aside className="hidden w-56 shrink-0 md:block">
          <ScrollArea className="h-[calc(100vh-340px)] max-h-[600px]">
            <nav className="space-y-1 pr-2">
              {/* All categories option */}
              <button
                onClick={() => handleCategorySelect("all")}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  courseFilters.category === "all"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>All</span>
                <span className="text-xs opacity-60">{totalCourseCount}</span>
              </button>

              {loadingCategories
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-6" />
                    </div>
                  ))
                : categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => handleCategorySelect(cat.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                        courseFilters.category === cat.id
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className="truncate pr-2">{cat.name}</span>
                      <span className="shrink-0 text-xs opacity-60">{cat._count?.courses ?? 0}</span>
                    </button>
                  ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* ── Mobile Category Chips ────────────────────────────────── */}
        <div className="mb-2 block md:hidden">
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
            <button
              onClick={() => handleCategorySelect("all")}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                courseFilters.category === "all"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:bg-muted"
              }`}
            >
              All
            </button>
            {loadingCategories
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
                ))
              : categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors ${
                      courseFilters.category === cat.id
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
          </div>
        </div>

        {/* ── Main Content Area ────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Search Bar */}
          <div className="relative mb-4 hidden md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search courses..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="h-10 pl-9"
            />
          </div>

          {/* Mobile search bar */}
          <div className="relative mb-4 md:hidden">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="h-9 pl-9 text-sm"
            />
          </div>

          {/* Course Grid / Loading / Empty ────────────────────────── */}
          {loadingCourses ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-border/50">
                  <Skeleton className="aspect-video w-full" />
                  <div className="p-3">
                    <Skeleton className="mb-2 h-4 w-full" />
                    <Skeleton className="mb-1 h-3 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <BookOpen className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                No courses found
              </h3>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Try adjusting your search or filters to discover courses that match your interests.
              </p>
              {courseFilters.search && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearchInput("");
                    setCourseFilters({ search: "" });
                  }}
                >
                  Clear search
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
              {courses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
