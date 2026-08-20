import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

// ============================================
// GET /api/auth/session
//
// Who the cookie says the caller is. The client store holds a user id for
// rendering, which survives a restart while the session may not; this lets the
// app find out which one is stale rather than trusting the store.
// ============================================

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ success: true, data: user });
}
