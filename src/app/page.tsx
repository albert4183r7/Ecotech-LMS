"use client";

import { useNavigationStore } from "@/stores/lms-store";
import { Navbar } from "@/components/lms/navbar";
import { Footer } from "@/components/lms/footer";
import { HomePage } from "@/components/lms/pages/home-page";
import { CoursesPage } from "@/components/lms/pages/courses-page";
import { MyLearningPage } from "@/components/lms/pages/my-learning-page";
import { ProfilePage } from "@/components/lms/pages/profile-page";
import { CourseDetailPage } from "@/components/lms/pages/course-detail-page";
import { ClassroomPage } from "@/components/lms/pages/classroom-page";
import { CreateCoursePage } from "@/components/lms/pages/create-course-page";
import { KeyboardShortcuts } from "@/components/lms/keyboard-shortcuts";

/**
 * Root page component that acts as the SPA router.
 * Uses Zustand navigation store to switch between views.
 * Only the "/" route exists in the App Router.
 */
export default function AppPage() {
  const { currentView } = useNavigationStore();

  /** Render the active view based on navigation state.
   *  Classroom uses full-screen mode (no footer). */
  const isFullView = currentView === "classroom";

  const renderView = () => {
    switch (currentView) {
      case "home":
        return <HomePage />;
      case "courses":
        return <CoursesPage />;
      case "my-learning":
        return <MyLearningPage />;
      case "profile":
        return <ProfilePage />;
      case "course-detail":
        return <CourseDetailPage />;
      case "classroom":
        return <ClassroomPage />;
      case "create-course":
        return <CreateCoursePage />;
      default:
        return <HomePage />;
    }
  };

  if (isFullView) {
    return (
      <>
        <ClassroomPage />
        <KeyboardShortcuts />
      </>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 page-transition">{renderView()}</main>
      <Footer />
      <KeyboardShortcuts />
    </div>
  );
}
