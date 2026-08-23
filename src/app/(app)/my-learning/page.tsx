import { MyLearningPage } from "./my-learning-page";
import { RoleGuard } from "@/components/lms/role-guard";

export default function Page() {
  return (
    <RoleGuard role="student">
      <MyLearningPage />
    </RoleGuard>
  );
}
