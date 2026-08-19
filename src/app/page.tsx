"use client";

import { useNavigationStore, useUserStore } from "@/stores/lms-store";
import { Navbar } from "@/components/lms/navbar";
import { Footer } from "@/components/lms/footer";
import { OnboardingTour } from "@/components/lms/onboarding-tour";
import { AnnouncementBanner } from "@/components/lms/announcement-banner";
import { AuthPage } from "@/components/lms/pages/auth-page";
import { HomePage } from "@/components/lms/pages/home-page";
import { CoursesPage } from "@/components/lms/pages/courses-page";
import { MyLearningPage } from "@/components/lms/pages/my-learning-page";
import { ProfilePage } from "@/components/lms/pages/profile-page";
import { CourseDetailPage } from "@/components/lms/pages/course-detail-page";
import { ClassroomPage } from "@/components/lms/pages/classroom-page";
import { CreateCoursePage } from "@/components/lms/pages/create-course-page";
import { DashboardPage } from "@/components/lms/pages/dashboard-page";
import { SettingsPage } from "@/components/lms/pages/settings-page";
import { FloatingActions } from "@/components/lms/floating-actions";
import { KeyboardShortcuts } from "@/components/lms/keyboard-shortcuts";

export default function AppPage() {
  const { currentView } = useNavigationStore();
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const currentRole = useUserStore((s) => s.currentRole);

  if (!isAuthenticated || currentView === "auth") {
    return (
      <div className="bg-background flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1">
          <AuthPage />
        </main>
        <Footer />
      </div>
    );
  }

  const isFullView = currentView === "classroom";

  const renderView = () => {
    switch (currentView) {
      case "home":
        return <HomePage />;
      case "dashboard":
        if (currentRole !== "instructor") return <HomePage />;
        return <DashboardPage />;
      case "courses":
        return <CoursesPage />;
      case "my-learning":
        if (currentRole !== "student") return <HomePage />;
        return <MyLearningPage />;
      case "profile":
        return <ProfilePage />;
      case "course-detail":
        return <CourseDetailPage />;
      case "classroom":
        return <ClassroomPage />;
      case "create-course":
        if (currentRole !== "instructor") return <HomePage />;
        return <CreateCoursePage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  if (isFullView) {
    return (
      <>
        <ClassroomPage />
        <KeyboardShortcuts />
        <OnboardingTour />
      </>
    );
  }

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <AnnouncementBanner />
      <main className="page-transition flex-1">
        <div key={currentView} className="view-transition-enter">
          {renderView()}
        </div>
      </main>
      <Footer />
      <FloatingActions />
      <KeyboardShortcuts />
      <OnboardingTour />
    </div>
  );
}
