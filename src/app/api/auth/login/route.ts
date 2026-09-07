import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession } from "@/lib/session";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/password";
import {
  clientIp,
  consume,
  reset,
  LOGIN_ACCOUNT_RULE,
  LOGIN_IP_RULE,
} from "@/lib/rate-limit";

// ============================================
// POST /api/auth/login
//
// Two things guard this endpoint, and they guard different attacks.
//
// Hashing means a copy of the database is not a copy of every password.
// Rate limiting means the endpoint itself cannot be used to guess one: per
// address, so one machine cannot work through a list, and per account, so a
// caller spreading requests across addresses still cannot spend more than a
// handful of guesses on any single user.
//
// Passwords seeded before hashing existed are upgraded here, on the one
// occasion the plaintext is known to be correct, so no account needs a reset.
// ============================================

/** Never says which of the two was wrong; that would confirm which emails exist. */
const INVALID = "Invalid email or password";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 },
      );
    }

    const address = email.trim();
    // Lowercased for the limiter key only. The lookup stays exact, because
    // this database matches email case-sensitively and normalising here would
    // lock out any account stored with a capital in it.
    const account = address.toLowerCase();
    const ip = clientIp(request.headers);

    // Both limits are consumed before the password is checked, so a rejected
    // attempt costs the attacker their allowance whether or not the account
    // exists — otherwise the limit itself would reveal which emails are real.
    const byIp = consume(`login:ip:${ip}`, LOGIN_IP_RULE);
    const byAccount = consume(`login:account:${account}`, LOGIN_ACCOUNT_RULE);

    if (!byIp.allowed || !byAccount.allowed) {
      const retryAfter = Math.max(byIp.retryAfterSeconds, byAccount.retryAfterSeconds);
      return NextResponse.json(
        {
          success: false,
          error: `Too many sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
        },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const user = await db.user.findUnique({
      where: { email: address },
      select: { id: true, email: true, name: true, role: true, password: true },
    });

    // A missing user still pays for a hash comparison, so the response time
    // does not separate "no such account" from "wrong password".
    const stored = user?.password ?? "";
    const matches = await verifyPassword(password, stored);

    if (!user || !matches) {
      return NextResponse.json({ success: false, error: INVALID }, { status: 401 });
    }

    // The one moment the plaintext is known to be right, so it is the only
    // moment a legacy row can be upgraded without asking the user for anything.
    // A failure here must not fail the sign-in: the password is correct either
    // way, and the row can be upgraded on the next login instead.
    if (needsRehash(stored)) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { password: await hashPassword(password) },
        });
      } catch (error) {
        console.error("[auth.login] could not upgrade stored password:", error);
      }
    }

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // A legitimate user who mistyped twice should not stay rationed once they
    // get it right.
    reset(`login:account:${account}`);
    reset(`login:ip:${ip}`);

    // The signed cookie is what the API authorizes against from here on; the
    // returned user is only for the UI to render with.
    await createSession(user.id);

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return NextResponse.json({ success: false, error: "Failed to log in" }, { status: 500 });
  }
}
