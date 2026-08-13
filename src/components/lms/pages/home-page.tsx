"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, BookOpen, Star, GraduationCap, FolderOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CourseCard } from "@/components/lms/course-card";
import { SearchAutocomplete } from "@/components/lms/search-autocomplete";
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
  const { homeTab, categories, courses, setCategories, setCourses, setHomeTab, courseFilters, setCourseFilters, setCreatePrompt } =
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

  function handleSearch(term: string) {
    setCourseFilters({ search: term });
  }

  function handleCreateCourse() {
    if (createPrompt.trim()) {
      setCreatePrompt(createPrompt.trim());
    }
    navigateTo("create-course");
  }

  // ── Render helpers ─────────────────────────────────────────────────
  const totalCourseCount = categories.reduce((sum, c) => sum + (c._count?.courses ?? 0), 0);

  return (
    <div className="flex flex-col">
      {/* ─── Hero Banner ─────────────────────────────────────────── */}
      <section className="hero-gradient relative px-4 py-10 sm:px-6 sm:py-14 md:px-8 lg:px-12">
        {/* SVG pattern overlay for visual depth */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="heroGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#heroGrid)" />
          <circle cx="85%" cy="15%" r="120" fill="none" stroke="white" strokeWidth="0.5" opacity="0.3" />
          <circle cx="10%" cy="90%" r="80" fill="none" stroke="white" strokeWidth="0.5" opacity="0.2" />
          <path d="M0 60 Q 200 20 400 60 T 800 60" fill="none" stroke="white" strokeWidth="0.4" opacity="0.15" />
          <path d="M0 90 Q 150 50 350 90 T 750 90" fill="none" stroke="white" strokeWidth="0.4" opacity="0.1" />
        </svg>

        {/* Animated decorative dots/circles */}
        <span className="hero-dot-1 pointer-events-none absolute left-[8%] top-[20%] h-3 w-3 rounded-full bg-white/20" />
        <span className="hero-dot-2 pointer-events-none absolute right-[12%] top-[25%] h-2 w-2 rounded-full bg-white/15" />
        <span className="hero-dot-3 pointer-events-none absolute left-[15%] bottom-[30%] h-4 w-4 rounded-full border border-white/15" />
        <span className="hero-dot-2 pointer-events-none absolute right-[20%] bottom-[25%] h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="hero-dot-1 pointer-events-none absolute left-[45%] top-[12%] h-1.5 w-1.5 rounded-full bg-white/25" />
        <span className="hero-dot-3 pointer-events-none absolute right-[35%] bottom-[40%] h-2 w-2 rounded-full border border-white/20" />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <h1 className="text-2xl font-bold text-white sm:text-3xl md:text-4xl">
            Create Your Course
          </h1>
          <p className="mt-1 text-sm font-medium tracking-wide text-white/90 sm:text-base md:mt-2">
            Empowering our team through knowledge sharing
          </p>
          <p className="mt-2 text-sm text-white/70 sm:text-base md:mt-3">
            Harness AI to build engaging courses in minutes — generate content, structure, and visuals effortlessly.
          </p>

          {/* Create prompt input with glow & gradient border */}
          <div className="mt-6 flex items-center gap-2 sm:mt-8">
            <div className="hero-search-glow relative flex-1 rounded-xl">
              <Sparkles className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/60" />
              <input
                type="text"
                placeholder="Describe your course idea..."
                value={createPrompt}
                onChange={(e) => setCreatePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCourse();
                }}
                className="h-11 w-full rounded-xl bg-white pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none sm:h-12 sm:text-base"
              />
            </div>
            <Button
              onClick={handleCreateCourse}
              className="h-11 shrink-0 rounded-xl bg-white px-5 font-semibold text-primary shadow-md shadow-black/10 transition-all hover:bg-white/90 hover:shadow-lg hover:shadow-black/15 sm:h-12 sm:px-6"
            >
              Try Create
            </Button>
          </div>

          {/* Tab buttons with animated underline */}
          <div className="mt-6 flex items-center justify-center gap-1 sm:mt-8">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors sm:px-5 sm:py-2 sm:text-base ${
                  homeTab === tab.key
                    ? "bg-white text-primary shadow-sm tab-underline-active"
                    : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Stats row in pill badges */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:mt-7">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
              <GraduationCap className="h-3 w-3" />
              {totalCourseCount} Courses
            </span>
            <span className="text-white/40">|</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
              <FolderOpen className="h-3 w-3" />
              {categories.length} Categories
            </span>
            <span className="text-white/40">|</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-sm">
              <Users className="h-3 w-3" />
              150+ Learners
            </span>
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
                className={`category-item flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  courseFilters.category === "all"
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary/60" />
                  All
                </span>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{totalCourseCount}</span>
              </button>

              {loadingCategories
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-6" />
                    </div>
                  ))
                : categories.map((cat) => {
                    const count = cat._count?.courses ?? 0;
                    const isFeatured = !loadingCategories && categories.length > 0 && count === Math.max(...categories.map((c) => c._count?.courses ?? 0));
                    return (
                      <button
                        key={cat.id}
                        onClick={() => handleCategorySelect(cat.id)}
                        className={`category-item flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${
                          courseFilters.category === cat.id
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: cat.color ?? "var(--color-primary)" }}
                          />
                          <span className="truncate">{cat.name}</span>
                          {isFeatured && <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />}
                        </span>
                        <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{count}</span>
                      </button>
                    );
                  })}
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
              All ({totalCourseCount})
            </button>
            {loadingCategories
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
                ))
              : categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id)}
                    className={`shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors ${
                      courseFilters.category === cat.id
                        ? "inline-flex bg-primary text-primary-foreground"
                        : "inline-flex border border-border bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: cat.color ?? "var(--color-primary)" }}
                    />
                    {cat.name}
                    {cat._count?.courses != null && cat._count.courses > 0 && (
                      <span className="ml-0.5 text-[11px] opacity-70">({cat._count.courses})</span>
                    )}
                  </button>
                ))}
          </div>
        </div>

        {/* ── Main Content Area ────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Search Bar (Desktop) */}
          <div className="mb-4 hidden md:block">
            <SearchAutocomplete
              value={searchInput}
              onChange={setSearchInput}
              onSearch={handleSearch}
              placeholder="Search courses..."
              courses={courses}
              categories={categories}
            />
          </div>

          {/* Search Bar (Mobile) */}
          <div className="mb-4 md:hidden">
            <SearchAutocomplete
              value={searchInput}
              onChange={setSearchInput}
              onSearch={handleSearch}
              placeholder="Search..."
              courses={courses}
              categories={categories}
              className="[&_input]:h-9 [&_input]:text-sm"
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
