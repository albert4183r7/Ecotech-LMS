"use client";

import { DashboardPage } from "@/components/lms/pages/dashboard-page";
import { RoleGuard } from "@/components/lms/role-guard";

export default function Page() {
  return (
    <RoleGuard role="instructor">
      <DashboardPage />
    </RoleGuard>
  );
}
