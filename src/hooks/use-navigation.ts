"use client";

import { useCallback } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import type { ClassroomState, ViewName } from "@/types/lms";
import { ROUTES, classroomPath, courseDetailPath, viewFromPathname } from "@/lib/routes";

// ============================================
// Navigation
//
// Replaces the old Zustand navigation store. The API is deliberately the same
// so existing call sites read identically, but navigation now goes through the
// router, which means every view has a real, shareable URL and the browser's
// back button works.
// ============================================

export interface Navigation {
  currentView: ViewName;
  selectedCourseId: string | null;
  navigateTo: (view: ViewName) => void;
  openCourseDetail: (courseId: string) => void;
  openClassroom: (state: Pick<ClassroomState, "lessonId">) => void;
  goBack: () => void;
}

export function useNavigation(): Navigation {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ courseId?: string; lessonId?: string }>();

  const navigateTo = useCallback(
    (view: ViewName) => {
      // course-detail and classroom need an id, so they are not in ROUTES;
      // callers reach them through openCourseDetail / openClassroom.
      const path = ROUTES[view as keyof typeof ROUTES];
      router.push(path ?? "/");
    },
    [router],
  );

  const openCourseDetail = useCallback(
    (courseId: string) => router.push(courseDetailPath(courseId)),
    [router],
  );

  const openClassroom = useCallback(
    (state: Pick<ClassroomState, "lessonId">) => router.push(classroomPath(state.lessonId)),
    [router],
  );

  const goBack = useCallback(() => router.back(), [router]);

  return {
    currentView: viewFromPathname(pathname ?? "/"),
    selectedCourseId: params?.courseId ?? null,
    navigateTo,
    openCourseDetail,
    openClassroom,
    goBack,
  };
}
