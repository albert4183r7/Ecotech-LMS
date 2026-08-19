import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CourseItem, HomeTab, MyLearningTab, CourseFilters, CategoryItem } from "@/types/lms";

// ============================================
// Course Store - manages course data and filters
// ============================================
interface CourseState {
  courses: CourseItem[];
  categories: CategoryItem[];
  homeTab: HomeTab;
  courseFilters: CourseFilters;
  createPrompt: string;
  editingCourseId: string | null;

  setCourses: (courses: CourseItem[]) => void;
  setCategories: (categories: CategoryItem[]) => void;
  setHomeTab: (tab: HomeTab) => void;
  setCourseFilters: (filters: Partial<CourseFilters>) => void;
  resetCourseFilters: () => void;
  setCreatePrompt: (prompt: string) => void;
  setEditingCourseId: (id: string | null) => void;
}

const defaultFilters: CourseFilters = {
  category: "all",
  sortBy: "newest",
  timeRange: "all",
  search: "",
};

export const useCourseStore = create<CourseState>((set) => ({
  courses: [],
  categories: [],
  homeTab: "hot",
  courseFilters: defaultFilters,
  createPrompt: "",
  editingCourseId: null,

  setCourses: (courses) => set({ courses }),
  setCategories: (categories) => set({ categories }),
  setHomeTab: (homeTab) => set({ homeTab }),
  setCourseFilters: (filters) =>
    set((state) => ({
      courseFilters: { ...state.courseFilters, ...filters },
    })),
  resetCourseFilters: () => set({ courseFilters: defaultFilters }),
  setCreatePrompt: (prompt) => set({ createPrompt: prompt }),
  setEditingCourseId: (id) => set({ editingCourseId: id }),
}));

// ============================================
// My Learning Store
// ============================================
interface MyLearningState {
  tab: MyLearningTab;
  enrollments: CourseItem[];
  favorites: CourseItem[];

  setTab: (tab: MyLearningTab) => void;
  setEnrollments: (enrollments: CourseItem[]) => void;
  setFavorites: (favorites: CourseItem[]) => void;
}

export const useMyLearningStore = create<MyLearningState>((set) => ({
  tab: "in-progress",
  enrollments: [],
  favorites: [],

  setTab: (tab) => set({ tab }),
  setEnrollments: (enrollments) => set({ enrollments }),
  setFavorites: (favorites) => set({ favorites }),
}));

// ============================================
// User Store
// ============================================
interface UserState {
  isAuthenticated: boolean;
  currentUserId: string;
  currentRole: "student" | "instructor";
  setCurrentUserId: (id: string) => void;
  setCurrentRole: (role: "student" | "instructor") => void;
  login: (id: string, role: "student" | "instructor") => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      currentUserId: "",
      currentRole: "student" as const,
      setCurrentUserId: (id) => set({ currentUserId: id }),
      setCurrentRole: (role) => set({ currentRole: role }),
      login: (id, role) => set({ isAuthenticated: true, currentUserId: id, currentRole: role }),
      // Clearing the flag is enough — the app shell renders the auth screen
      // whenever isAuthenticated is false, whatever route you are on.
      logout: () =>
        set({ isAuthenticated: false, currentUserId: "", currentRole: "student" as const }),
    }),
    { name: "ecotech-user" },
  ),
);
