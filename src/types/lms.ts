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
  sections: SectionItem[];
  _count?: { enrollments: number; favorites: number };
  createdAt: string;
  updatedAt: string;
}

/** Section/chapter within a course */
export interface SectionItem {
  id: string;
  title: string;
  content: string | null; // DEPRECATED: legacy JSON blob
  htmlBody: string | null; // HTML+Tailwind for iframe renderer
  order: number;
  totalPages: number;
  courseId: string;
}

/** User enrollment data */
export interface EnrollmentItem {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  course: CourseItem;
}

/** User progress per section */
export interface ProgressItem {
  id: string;
  completed: boolean;
  currentPage: number;
  sectionId: string;
  section: SectionItem;
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

/** @deprecated — kept for PPTX route compatibility during migration */
export interface SlideContent {
  title: string;
  subtitle?: string;
  type: "content" | "title" | "quiz" | "table" | "list" | "code";
  items?: SlideItem[];
  tableData?: { headers: string[]; rows: string[][] };
  codeBlock?: { language: string; code: string };
}

/** @deprecated */
export interface SlideItem {
  heading?: string;
  text: string;
  icon?: string;
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

/** Classroom viewer state — now uses htmlBody (iframe) instead of slides[] */
export interface ClassroomState {
  courseId: string;
  courseTitle: string;
  sectionId: string;
  sectionTitle: string;
  htmlBody: string; // Full HTML document for iframe srcDoc
  // Section navigation context
  allSectionIds: string[]; // ordered list of all section IDs in the course
  currentSectionIndex: number; // index into allSectionIds
}
