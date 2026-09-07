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
  "mastery-sprint": "/mastery-sprint",
  dashboard: "/dashboard",
  profile: "/profile",
  "create-course": "/create",
  quizzes: "/quizzes",
};

export const courseDetailPath = (courseId: string) => `/courses/${courseId}`;
/** Full-page course-grounded AI workspace. */
export const courseAssistantPath = (courseId: string) => `/courses/${courseId}/assistant`;
export const classroomPath = (lessonId: string) => `/learn/${lessonId}`;
/** A student taking one quiz. */
export const quizAttemptPath = (quizId: string) => `/quizzes/${quizId}`;
/** Instructor review of a generated lesson, before it is published. */
export const lessonPreviewPath = (lessonId: string) => `/preview/${lessonId}`;

/** Reverse-map a pathname to the view name components still reason about. */
export function viewFromPathname(pathname: string): ViewName {
  if (pathname.startsWith("/learn/")) return "classroom";
  if (pathname.startsWith("/preview/")) return "create-course";
  if (pathname.startsWith("/quizzes")) return "quizzes";
  if (/^\/courses\/[^/]+(?:\/assistant)?$/.test(pathname)) return "course-detail";
  if (pathname.startsWith("/courses")) return "courses";
  if (pathname.startsWith("/my-learning")) return "my-learning";
  if (pathname.startsWith("/mastery-sprint")) return "mastery-sprint";
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/profile")) return "profile";
  if (pathname.startsWith("/create")) return "create-course";
  return "home";
}
