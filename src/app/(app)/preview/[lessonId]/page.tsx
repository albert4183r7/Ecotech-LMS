import { LessonPreviewPage } from "./lesson-preview-page";
import { RoleGuard } from "@/components/lms/role-guard";

export default function Page() {
  return (
    <RoleGuard role="instructor">
      <LessonPreviewPage />
    </RoleGuard>
  );
}
