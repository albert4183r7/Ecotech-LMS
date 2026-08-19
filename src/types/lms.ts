// ============================================
// LMS Type Definitions
// ============================================

/** Navigation view names for the SPA */
export type ViewName =
  | "auth"
  | "home"
  | "dashboard"
  | "courses"
  | "my-learning"
  | "profile"
  | "course-detail"
  | "classroom"
  | "create-course"
  | "settings";

/** Course data shape */
export interface CourseItem {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  rating: number;
  studentCount: number;
  status: string;
  language: string;
  category: { id: string; name: string; color: string | null } | null;
  creator: { id: string; name: string | null; avatar: string | null } | null;
  lessons: LessonItem[];
  _count?: { enrollments: number; favorites: number };
  createdAt: string;
  updatedAt: string;
}

/** Lesson/chapter within a course */
export interface LessonItem {
  id: string;
  title: string;
  order: number;
  outlineJson: string | null;
  courseId: string;
  createdAt: string;
  updatedAt: string;
}

/** Slide within a lesson */
export interface SlideItem {
  id: string;
  title: string;
  htmlBody: string;
  status: "DRAFT_OUTLINE" | "GENERATING" | "READY" | "ERROR";
  order: number;
  lessonId: string;
  createdAt: string;
  updatedAt: string;
}

/** User enrollment data */
export interface EnrollmentItem {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  course: CourseItem;
}

/** User progress per lesson */
export interface ProgressItem {
  id: string;
  completed: boolean;
  currentPage: number;
  lessonId: string;
  lesson: LessonItem;
}

/** User profile data */
export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  role: string;
  department: string | null;
  createdAt: string;
}

/** Category for course organization */
export interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  _count?: { courses: number };
}

/** My Learning stats */
export interface LearningStats {
  totalCourses: number;
  inProgress: number;
  completed: number;
  avgProgress: number;
}

/** Course filter options */
export interface CourseFilters {
  category: string;
  sortBy: "newest" | "most_students" | "alphabetical" | "rating";
  timeRange: "all" | "week" | "month";
  search: string;
}

/** Home page tab */
export type HomeTab = "hot" | "new" | "recommended";

/** My Learning tab */
export type MyLearningTab = "in-progress" | "completed" | "favorites";

/** Classroom viewer state — uses htmlBody (iframe) from slides */
export interface ClassroomState {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  htmlBody: string; // Full HTML document for iframe srcDoc
  // Lesson navigation context
  allLessonIds: string[]; // ordered list of all lesson IDs in the course
  currentLessonIndex: number; // index into allLessonIds
}

// ============================================
// Profile / activity
//
// These were referenced by the profile screens but never declared, so the
// files did not typecheck. Shapes taken from /api/activity and
// /api/enrollments.
// ============================================

/** One cell in the streak calendar grid. */
export interface ActivityDayEntry {
  date: string;
  day: string;
  isToday: boolean;
}

/** A single day's tracked study time. */
export interface ActivityDayData {
  date: string;
  minutes: number;
}

/** Response payload of GET /api/activity. */
export interface Activity30Data {
  weeklyData: ActivityDayData[];
  dailyData: ActivityDayData[];
  streak: { current: number; longest: number };
  totalMinutes: number;
}

/** An enrollment as returned by GET /api/enrollments. */
export interface EnrollmentData {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  progress: number;
  course: {
    id: string;
    title: string;
    description: string | null;
    coverImage: string | null;
    rating: number;
    language: string;
    category: Pick<CategoryItem, "id" | "name" | "color"> | null;
    lessonsCount: number;
  };
}
