import { NextRequest, NextResponse } from "next/server";
import { createSession, requireUser, AuthorizationError, type UserRole } from "@/lib/session";

/** Switch the active role for the current account without creating another account. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { role?: unknown };
    if (body.role !== "student" && body.role !== "instructor") {
      return NextResponse.json({ success: false, error: "Invalid role." }, { status: 400 });
    }

    const requestedRole = body.role as UserRole;
    await createSession(user.id, requestedRole);
    return NextResponse.json({ success: true, data: { role: requestedRole, roles: user.roles } });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Error switching role:", error);
    return NextResponse.json({ success: false, error: "Failed to switch role." }, { status: 500 });
  }
}
