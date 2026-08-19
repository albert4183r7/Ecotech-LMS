"use client";

import { CreateCoursePage } from "@/components/lms/pages/create-course-page";
import { RoleGuard } from "@/components/lms/role-guard";

export default function Page() {
  return (
    <RoleGuard role="instructor">
      <CreateCoursePage />
    </RoleGuard>
  );
}
