import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ACCOUNT_ROLES, createSession } from "@/lib/session";
import { hashPassword } from "@/lib/password";

/** Create an account and sign it in immediately. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { success: false, error: "A valid email is required." },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "An account with that email already exists." },
        { status: 409 },
      );
    }

    const roles = [...ACCOUNT_ROLES];
    const activeRole = "student" as const;
    const user = await db.user.create({
      data: {
        email,
        password: await hashPassword(password),
        name: name || null,
        role: activeRole,
        roles: JSON.stringify(roles),
      },
      select: { id: true, email: true, name: true },
    });

    await createSession(user.id, activeRole);
    return NextResponse.json(
      { success: true, data: { ...user, role: activeRole, roles } },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error registering account:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create account." },
      { status: 500 },
    );
  }
}
