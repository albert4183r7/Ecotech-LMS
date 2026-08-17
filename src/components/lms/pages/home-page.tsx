"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, BookOpen, Star, GraduationCap, FolderOpen, Users, Play, ChevronDown, TrendingUp, BarChart3, BookMarked, ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { CourseCard } from "@/components/lms/course-card";
import { SearchAutocomplete } from "@/components/lms/search-autocomplete";
import { LeaderboardWidget } from "@/components/lms/leaderboard-widget";
import { CourseRecommendations } from "@/components/lms/course-recommendations";
import { DailyChallenges } from "@/components/lms/daily-challenges";
import { SocialFeed } from "@/components/lms/social-feed";
import { useNavigationStore, useCourseStore, useUserStore } from "@/stores/lms-store";
import type { CourseItem, CategoryItem, HomeTab } from "@/types/lms";

/** Shape returned by /api/enrollments for continue learning */
interface EnrollmentCourse {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  language: string;
  category: { id: string; name: string; color?: string | null } | null;
  sectionsCount: number;
}

interface Enrollment {
  id: string;
  status: string;
  progress: number;
  enrolledAt: string;
  completedAt: string | null;
  course: EnrollmentCourse;
}

/** Popular search tags */
const POPULAR_SEARCHES = ["React", "TypeScript", "Python", "DevOps"];

/** Typing animation words */
const TYPING_WORDS = ["Learn.", "Grow.", "Excel.", "Achieve.", "Thrive.", "Innovate."];

/** Category icons mapping */
const CATEGORY_ICONS: Record<string, string> = {
  "Web Development": "💻",
  "Data Science": "📊",
  "Mobile Dev": "📱",
  "DevOps": "⚙️",
  "Design": "🎨",
  "AI/ML": "🤖",
  "Security": "🔒",
  "Cloud": "☁️",
};

/** Count-up animation hook */
function useCountUp(target: number, duration = 1200, enabled = true) {
  const [value, setValue] = useState(0);
  const ref = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => {
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [target, duration, enabled]);

  return value;
}

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

/** Quick stat card data */
const QUICK_STATS = [
  { key: "courses", label: "Total Courses", icon: BookOpen, gradient: "from-blue-500 to-cyan-500", getValue: (courses: number) => courses, animated: true },
  { key: "categories", label: "Categories", icon: FolderOpen, gradient: "from-violet-500 to-purple-500", getValue: (_: number, cats: number) => cats, animated: true },
  { key: "learners", label: "Learners", icon: Users, gradient: "from-emerald-500 to-teal-500", getValue: () => 150, animated: true },
  { key: "completion", label: "Completion Rate", icon: Zap, gradient: "from-amber-500 to-orange-500", getValue: () => 92, animated: true, suffix: "%" },
];

export function HomePage() {
  const { navigateTo, openCourseDetail } = useNavigationStore();
  const { homeTab, categories, courses, setCategories, setCourses, setHomeTab, courseFilters, setCourseFilters, setCreatePrompt } =
    useCourseStore();
  const currentUserId = useUserStore((s) => s.currentUserId);
  const currentRole = useUserStore((s) => s.currentRole);

  const [searchInput, setSearchInput] = useState(courseFilters.search);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [heroPrompt, setHeroPrompt] = useState("");
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(true);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);
  const [typingCharIndex, setTypingCharIndex] = useState(0);
  const [typingDeleting, setTypingDeleting] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

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

  // ── Fetch enrollments for Continue Learning ─────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchEnrollments() {
      try {
        const res = await fetch(`/api/enrollments?userId=${currentUserId}`);
        const json = await res.json();
        if (!cancelled && json.success) {
          const inProgress = json.data
            .filter((e: Enrollment) => e.status === "in_progress")
            .slice(0, 3);
          setEnrollments(inProgress);
        }
      } catch (err) {
        console.error("Failed to fetch enrollments", err);
      } finally {
        if (!cancelled) setLoadingEnrollments(false);
      }
    }
    fetchEnrollments();
    return () => { cancelled = true; };
  }, [currentUserId]);

  // ── Typing animation ──────────────────────────────────────────────
  useEffect(() => {
    const word = TYPING_WORDS[typingIndex];
    if (!typingDeleting && typingCharIndex < word.length) {
      const timer = setTimeout(() => setTypingCharIndex((c) => c + 1), 80);
      return () => clearTimeout(timer);
    } else if (!typingDeleting && typingCharIndex === word.length) {
      const timer = setTimeout(() => setTypingDeleting(true), 1800);
      return () => clearTimeout(timer);
    } else if (typingDeleting && typingCharIndex > 0) {
      const timer = setTimeout(() => setTypingCharIndex((c) => c - 1), 40);
      return () => clearTimeout(timer);
    } else if (typingDeleting && typingCharIndex === 0) {
      setTypingDeleting(false);
      setTypingIndex((prev) => (prev + 1) % TYPING_WORDS.length);
    }
  }, [typingIndex, typingCharIndex, typingDeleting]);

  // ── Parallax scroll effect ─────────────────────────────────────────
  useEffect(() => {
    function handleScroll() {
      setScrollY(window.scrollY);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Intersection observer for stats animation ──────────────────────
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsVisible(true); },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Animated counter values ────────────────────────────────────────
  const totalCourseCount = categories.reduce((sum, c) => sum + (c._count?.courses ?? 0), 0);
  const countCourses = useCountUp(totalCourseCount, 1200, statsVisible);
  const countCategories = useCountUp(categories.length, 800, statsVisible);
  const countLearners = useCountUp(150, 1400, statsVisible);
  const countCompletion = useCountUp(92, 1600, statsVisible);

  const counterValues = [countCourses, countCategories, countLearners, countCompletion];

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

  function handlePopularSearch(tag: string) {
    setSearchInput(tag);
    setCourseFilters({ search: tag });
  }

  function handleCreateCourse() {
    if (heroPrompt.trim()) {
      setCreatePrompt(heroPrompt.trim());
    }
    navigateTo("create-course");
  }

  // ── Render helpers ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-0 overflow-x-hidden">

      {/* ─── Quick Stats Dashboard ──────────────────────────────── */}
      <section className="px-4 py-4 sm:px-6 md:px-8 lg:px-12" ref={statsRef}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
          {QUICK_STATS.map((stat, i) => {
            const Icon = stat.icon;
            const animatedValue = statsVisible ? counterValues[i] : 0;
            const suffix = 'suffix' in stat && stat.suffix ? stat.suffix : '';
            return (
              <div
                key={stat.key}
                className={`glass-card stat-pop stat-delay-${i + 1} flex items-center gap-3 rounded-xl p-4`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${stat.gradient} shadow-sm`}>
                  <Icon className="h-5 w-5 text-white" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold tabular-nums text-foreground">
                    <span className={statsVisible ? 'counter-value' : ''}>
                      {stat.animated ? `${animatedValue}${suffix}` : stat.getValue(totalCourseCount, categories.length)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stat.label}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Content Area: Sidebar + Course Grid ──────────────────── */}
      <section className="flex min-w-0 flex-1 gap-6 px-4 py-4 sm:px-6 md:px-8 lg:px-12">
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
          <div className="mb-3 hidden md:block">
            <SearchAutocomplete
              value={searchInput}
              onChange={setSearchInput}
              onSearch={handleSearch}
              placeholder="Search courses..."
              courses={courses}
              categories={categories}
            />
            {/* Popular Searches */}
            <div className="mt-2 flex items-center gap-2">
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">Popular:</span>
              {POPULAR_SEARCHES.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handlePopularSearch(tag)}
                  className="shrink-0 rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Search Bar (Mobile) */}
          <div className="mb-3 md:hidden">
            <SearchAutocomplete
              value={searchInput}
              onChange={setSearchInput}
              onSearch={handleSearch}
              placeholder="Search..."
              courses={courses}
              categories={categories}
              className="[&_input]:h-9 [&_input]:text-sm"
            />
            {/* Popular Searches */}
            <div className="mt-2 flex items-center gap-2 overflow-x-auto">
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="shrink-0 text-xs text-muted-foreground">Popular:</span>
              {POPULAR_SEARCHES.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handlePopularSearch(tag)}
                  className="shrink-0 rounded-full border border-border/60 bg-card px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* ── Continue Learning Section (Student Only) ────────────── */}
          {currentRole === "student" && !loadingEnrollments && enrollments.length > 0 && (
            <div className="mb-5">
              <div className="mb-3 flex items-center gap-2">
                <BookMarked className="h-4 w-4 text-primary" aria-hidden="true" />
                <h2 className="text-sm font-semibold text-foreground">Continue Learning</h2>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                {enrollments.map((enrollment, i) => (
                  <div
                    key={enrollment.id}
                    className="stagger-fade-in w-64 shrink-0 overflow-hidden rounded-xl border border-border/50 bg-card transition-shadow hover:shadow-md"
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div className="relative aspect-video w-full bg-muted">
                      {enrollment.course.coverImage ? (
                        <img
                          src={enrollment.course.coverImage}
                          alt={enrollment.course.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <BookOpen className="h-8 w-8 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="absolute bottom-2 left-2">
                        <Badge variant="secondary" className="bg-background/80 text-[10px] font-medium backdrop-blur-sm">
                          {enrollment.progress}%
                        </Badge>
                      </div>
                    </div>
                    <div className="p-3">
                      <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
                        {enrollment.course.title}
                      </h3>
                      {enrollment.course.category && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {enrollment.course.category.name}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <Progress
                          value={enrollment.progress}
                          className="h-1.5 flex-1 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-primary/80 [&_[data-slot=progress-indicator]]:to-primary"
                        />
                        <Button
                          size="sm"
                          className="h-7 shrink-0 gap-1 rounded-lg px-3 text-xs"
                          onClick={() => openCourseDetail(enrollment.course.id)}
                        >
                          <Play className="h-3 w-3" aria-hidden="true" />
                          Continue
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Continue Learning Loading Skeleton (Student Only) ── */}
          {currentRole === "student" && loadingEnrollments && (
            <div className="mb-5">
              <div className="mb-3 flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="w-64 shrink-0 overflow-hidden rounded-xl border border-border/50">
                    <Skeleton className="aspect-video w-full" />
                    <div className="p-3">
                      <Skeleton className="mb-2 h-4 w-full" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Daily Challenges (Student Only) ─────────────────────── */}
          {currentRole === "student" && (
          <div className="mb-5">
            <DailyChallenges />
          </div>
          )}

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
            <div className="empty-state flex flex-col items-center justify-center py-20 text-center">
              <div className="empty-illustration flex h-16 w-16 items-center justify-center rounded-full bg-muted">
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
              {courses.map((course, i) => (
                <div key={course.id} className="stagger-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                  <CourseCard course={course} index={i} />
                </div>
              ))}
            </div>
          )}

          {/* ── Course Recommendations (Student Only) ────────────────── */}
          {currentRole === "student" && <CourseRecommendations />}
        </div>

        {/* ── Desktop Right Sidebar (Student: Leaderboard + Social Feed) */}
        {currentRole === "student" && (
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-6 space-y-4">
            <LeaderboardWidget />
            <SocialFeed />
          </div>
        </aside>
        )}
      </section>

      {/* ── Mobile Leaderboard (Collapsible, Student Only) ────────── */}
      {currentRole === "student" && (
      <section className="px-4 pb-6 md:hidden">
        <Collapsible open={leaderboardOpen} onOpenChange={setLeaderboardOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/50 bg-card p-4 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-teal-500">
                <BarChart3 className="h-4 w-4 text-white" aria-hidden="true" />
              </div>
              <span className="text-sm font-semibold text-foreground">Leaderboard</span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${leaderboardOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3">
              <LeaderboardWidget />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </section>
      )}

      {/* ── Mobile Social Feed (Student Only) ─────────────────────── */}
      {currentRole === "student" && (
      <section className="px-4 pb-6 md:hidden">
        <SocialFeed />
      </section>
      )}
    </div>
  );
}
