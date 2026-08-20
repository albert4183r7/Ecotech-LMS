"use client";

import { LessonPreviewPage } from "@/components/lms/pages/lesson-preview-page";
import { RoleGuard } from "@/components/lms/role-guard";

export default function Page() {
  return (
    <RoleGuard role="instructor">
      <LessonPreviewPage />
    </RoleGuard>
  );
}
