import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CreateCoursePage } from "./create-course-page";
import { RoleGuard } from "@/components/lms/role-guard";

// The editor reads the draft's id from the query string, so it needs a
// Suspense boundary: without one the whole route opts out of prerendering.
export default function Page() {
  return (
    <RoleGuard role="instructor">
      <Suspense
        fallback={
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
          </div>
        }
      >
        <CreateCoursePage />
      </Suspense>
    </RoleGuard>
  );
}
