import { create } from "zustand";
import type {
  ViewName,
  CourseItem,
  ClassroomState,
  HomeTab,
  MyLearningTab,
  CourseFilters,
  CategoryItem,
} from "@/types/lms";

// ============================================
// Navigation Store - manages SPA routing
// ============================================
interface NavigationState {
  currentView: ViewName;
  previousView: ViewName | null;
  selectedCourseId: string | null;
  classroomState: ClassroomState | null;

  navigateTo: (view: ViewName) => void;
  openCourseDetail: (courseId: string) => void;
  openClassroom: (state: ClassroomState) => void;
  goBack: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: "home",
  previousView: null,
  selectedCourseId: null,
  classroomState: null,

  navigateTo: (view) =>
    set((state) => ({
      currentView: view,
      previousView: state.currentView,
      selectedCourseId: null,
      classroomState: null,
    })),

  openCourseDetail: (courseId) =>
    set((state) => ({
      currentView: "course-detail",
      previousView: state.currentView,
      selectedCourseId: courseId,
    })),

  openClassroom: (classroomState) =>
    set((state) => ({
      currentView: "classroom",
      previousView: state.currentView,
      classroomState,
    })),

  goBack: () =>
    set((state) => ({
      currentView: state.previousView || "home",
      previousView: null,
    })),
}));

// ============================================
// Course Store - manages course data and filters
// ============================================
interface CourseState {
  courses: CourseItem[];
  categories: CategoryItem[];
  homeTab: HomeTab;
  courseFilters: CourseFilters;
  createPrompt: string;

  setCourses: (courses: CourseItem[]) => void;
  setCategories: (categories: CategoryItem[]) => void;
  setHomeTab: (tab: HomeTab) => void;
  setCourseFilters: (filters: Partial<CourseFilters>) => void;
  resetCourseFilters: () => void;
  setCreatePrompt: (prompt: string) => void;
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

  setCourses: (courses) => set({ courses }),
  setCategories: (categories) => set({ categories }),
  setHomeTab: (homeTab) => set({ homeTab }),
  setCourseFilters: (filters) =>
    set((state) => ({
      courseFilters: { ...state.courseFilters, ...filters },
    })),
  resetCourseFilters: () => set({ courseFilters: defaultFilters }),
  setCreatePrompt: (prompt) => set({ createPrompt: prompt }),
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

export const useUserStore = create<UserState>((set) => ({
  isAuthenticated: false,
  currentUserId: "",
  currentRole: "student" as const,
  setCurrentUserId: (id) => set({ currentUserId: id }),
  setCurrentRole: (role) => set({ currentRole: role }),
  login: (id, role) => set({ isAuthenticated: true, currentUserId: id, currentRole: role }),
  logout: () => {
    // Reset user state and navigate back to auth
    useNavigationStore.getState().navigateTo("auth");
    set({ isAuthenticated: false, currentUserId: "", currentRole: "student" as const });
  },
}));
