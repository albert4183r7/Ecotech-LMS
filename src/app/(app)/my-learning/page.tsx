"use client";

import { MyLearningPage } from "@/components/lms/pages/my-learning-page";
import { RoleGuard } from "@/components/lms/role-guard";

export default function Page() {
  return (
    <RoleGuard role="student">
      <MyLearningPage />
    </RoleGuard>
  );
}
