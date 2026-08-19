"use client";

import { useUserStore } from "@/stores/lms-store";
import { Navbar } from "@/components/lms/navbar";
import { Footer } from "@/components/lms/footer";
import { OnboardingTour } from "@/components/lms/onboarding-tour";
import { AnnouncementBanner } from "@/components/lms/announcement-banner";
import { AuthPage } from "@/components/lms/pages/auth-page";
import { FloatingActions } from "@/components/lms/floating-actions";
import { KeyboardShortcuts } from "@/components/lms/keyboard-shortcuts";

/** Chrome shared by every signed-in page, plus the auth gate. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);

  if (!isAuthenticated) {
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

  return (
    <div className="bg-background flex min-h-screen flex-col">
      <Navbar />
      <AnnouncementBanner />
      <main className="page-transition flex-1">{children}</main>
      <Footer />
      <FloatingActions />
      <KeyboardShortcuts />
      <OnboardingTour />
    </div>
  );
}
