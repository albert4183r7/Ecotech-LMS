"use client";

import { useUserStore } from "@/stores/lms-store";
import { AuthPage } from "@/components/lms/pages/auth-page";
import { ClassroomPage } from "@/components/lms/pages/classroom-page";
import { KeyboardShortcuts } from "@/components/lms/keyboard-shortcuts";
import { OnboardingTour } from "@/components/lms/onboarding-tour";

export default function Page() {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <AuthPage />;

  return (
    <>
      <ClassroomPage />
      <KeyboardShortcuts />
      <OnboardingTour />
    </>
  );
}
