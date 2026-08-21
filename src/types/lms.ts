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
  | "quizzes";

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
/** One slide of the lesson being viewed. */
export interface ClassroomSlide {
  id: string;
  title: string;
  htmlBody: string; // Full HTML document for iframe srcDoc
  order: number;
}

export interface ClassroomState {
  courseId: string;
  courseTitle: string;
  lessonId: string;
  lessonTitle: string;
  // Every slide in the lesson. The classroom previously held only the first
  // slide's HTML, so a lesson of any length displayed a single slide.
  slides: ClassroomSlide[];
  currentSlideIndex: number;
  // Lesson navigation context
  allLessonIds: string[]; // ordered list of all lesson IDs in the course
  currentLessonIndex: number; // index into allLessonIds
}

// ============================================
// Enrollments
// ============================================

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
