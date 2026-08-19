import type { ViewName } from "@/types/lms";

// ============================================
// Route table
//
// The app used to switch on a `currentView` string held in a Zustand store.
// These are the real URLs those views now live at; the mapping exists so the
// existing navigateTo("courses") call sites keep working.
// ============================================

export const ROUTES: Record<Exclude<ViewName, "course-detail" | "classroom">, string> = {
  auth: "/",
  home: "/",
  courses: "/courses",
  "my-learning": "/my-learning",
  dashboard: "/dashboard",
  profile: "/profile",
  "create-course": "/create",
  settings: "/settings",
};

export const courseDetailPath = (courseId: string) => `/courses/${courseId}`;
export const classroomPath = (lessonId: string) => `/learn/${lessonId}`;

/** Reverse-map a pathname to the view name components still reason about. */
export function viewFromPathname(pathname: string): ViewName {
  if (pathname.startsWith("/learn/")) return "classroom";
  if (/^\/courses\/[^/]+$/.test(pathname)) return "course-detail";
  if (pathname.startsWith("/courses")) return "courses";
  if (pathname.startsWith("/my-learning")) return "my-learning";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/create")) return "create-course";
  if (pathname.startsWith("/settings")) return "settings";
  return "home";
}
