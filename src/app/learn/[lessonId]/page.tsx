"use client";

import { useUserStore } from "@/stores/lms-store";
import { AuthPage } from "@/components/lms/auth-page";
import { ClassroomPage } from "./classroom-page";
import { KeyboardShortcuts } from "@/components/lms/keyboard-shortcuts";
import { OnboardingTour } from "@/components/lms/onboarding-tour";
import { SessionSync } from "@/components/lms/session-sync";

export default function Page() {
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);

  // The classroom is outside the app layout, which is where SessionSync
  // normally runs — so opening a lesson link in a browser that has the cookie
  // but not the client's own copy of the session showed the sign-in page.
  if (!isAuthenticated) {
    return (
      <>
        <SessionSync />
        <AuthPage />
      </>
    );
  }

  return (
    <>
      <SessionSync />
      <ClassroomPage />
      <KeyboardShortcuts />
      <OnboardingTour />
    </>
  );
}
