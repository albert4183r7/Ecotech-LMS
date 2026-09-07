import { RoleGuard } from "@/components/lms/role-guard";
import { MasterySprintPage } from "./mastery-sprint-page";

export default function Page() {
  return (
    <RoleGuard role="student">
      <MasterySprintPage />
    </RoleGuard>
  );
}
