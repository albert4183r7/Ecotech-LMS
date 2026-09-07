import { RoleGuard } from "@/components/lms/role-guard";
import { RiskCenterPage } from "./risk-center-page";

export default function Page() {
  return (
    <RoleGuard role="instructor">
      <RiskCenterPage />
    </RoleGuard>
  );
}
