"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUserStore } from "@/stores/lms-store";

/**
 * Restrict a route to one role.
 *
 * The old switch-based shell silently rendered the home page when the role did
 * not match. With real URLs a redirect is the honest behaviour: the address bar
 * should not keep showing a page you are not on.
 */
export function RoleGuard({
  role,
  children,
}: {
  role: "student" | "instructor";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const currentRole = useUserStore((s) => s.currentRole);
  const allowed = currentRole === role;

  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);

  if (!allowed) return null;
  return <>{children}</>;
}
