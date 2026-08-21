import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";

// ============================================
// Server-side sessions
//
// Authorization has to be decided from something the client cannot choose.
// Every protected route previously took a userId from the query string or the
// request body, so any caller could act as any user simply by sending a
// different id — the UI hid the wrong buttons, but the API did not refuse the
// request behind them.
//
// A session is a signed, HTTP-only cookie: the browser sends it automatically
// and cannot read or forge it. The payload is the user id and an expiry, and
// the signature is an HMAC over both. Nothing about the user's role is trusted
// from the cookie — the role is read from the database on every check, so a
// change of role takes effect immediately.
// ============================================

const COOKIE_NAME = "ecotech_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

export type UserRole = "student" | "instructor";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

/**
 * The signing secret.
 *
 * A missing secret in production is a configuration error, not something to
 * paper over with a default — a predictable key means forgeable sessions. In
 * development a stable per-process key keeps `npm run dev` usable without
 * setup, at the cost of logging everyone out on restart.
 */
let devSecret: string | null = null;
function signingSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[Session Config Error] SESSION_SECRET must be set to at least 32 characters in production. See the README.",
    );
  }
  if (!devSecret) {
    devSecret = randomBytes(32).toString("hex");
    console.warn(
      "[session] SESSION_SECRET is not set; using a temporary development key. " +
        "Sessions will not survive a restart. Set SESSION_SECRET in .env to fix this.",
    );
  }
  return devSecret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/** Compare in constant time, so a signature cannot be discovered byte by byte. */
function signatureMatches(payload: string, signature: string): boolean {
  const expected = Buffer.from(sign(payload));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function encode(userId: string): string {
  const payload = `${userId}.${Date.now() + MAX_AGE_SECONDS * 1000}`;
  return `${payload}.${sign(payload)}`;
}

/** The user id in a cookie, if it is well-formed, correctly signed and current. */
function decode(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresAt, signature] = parts;
  if (!signatureMatches(`${userId}.${expiresAt}`, signature)) return null;

  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return null;

  return userId;
}

/** Start a session for a user who has just proved who they are. */
export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, encode(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/**
 * The signed-in user, or null.
 *
 * The role comes from the database rather than the cookie, so a session cannot
 * outlive the permissions it was issued under.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const userId = decode(store.get(COOKIE_NAME)?.value);
  if (!userId) return null;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role === "instructor" ? "instructor" : "student",
  };
}

/** Raised by the require* helpers; carries the status the route should return. */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** The signed-in user, or a 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthorizationError("You must be signed in to do this.", 401);
  return user;
}

/**
 * The signed-in user, who must own the course.
 *
 * A course that exists but belongs to someone else is reported as not found
 * rather than forbidden, so the endpoint does not confirm the existence of
 * other people's courses to a caller enumerating ids.
 */
export async function requireCourseOwner(courseId: string): Promise<SessionUser> {
  const user = await requireUser();
  const course = await db.course.findUnique({
    where: { id: courseId },
    select: { creatorId: true },
  });
  if (!course) throw new AuthorizationError("Course not found.", 404);
  if (course.creatorId !== user.id) throw new AuthorizationError("Course not found.", 404);
  return user;
}

/** The signed-in user, who must own the course this lesson belongs to. */
export async function requireLessonOwner(
  lessonId: string,
): Promise<{ user: SessionUser; courseId: string }> {
  const user = await requireUser();
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { courseId: true, course: { select: { creatorId: true } } },
  });
  if (!lesson) throw new AuthorizationError("Lesson not found.", 404);
  if (lesson.course.creatorId !== user.id) throw new AuthorizationError("Lesson not found.", 404);
  return { user, courseId: lesson.courseId };
}

/**
 * May this user read the lesson's content?
 *
 * The course's instructor always may. Anyone else only when the course is
 * published and they are enrolled in it — the same rule the quiz endpoints
 * apply, kept in one place so reading a lesson through the lesson endpoint,
 * the preview endpoint or a PPTX export cannot disagree.
 */
export async function mayReadLesson(lessonId: string, userId: string): Promise<boolean> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { courseId: true, course: { select: { creatorId: true, status: true } } },
  });
  if (!lesson) return false;
  if (lesson.course.creatorId === userId) return true;
  if (lesson.course.status !== "published") return false;

  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId: lesson.courseId } },
    select: { id: true },
  });
  return Boolean(enrollment);
}

/**
 * The signed-in user, who must be allowed to read the lesson.
 *
 * Reports a lesson they may not read as not found: an unpublished course's
 * lesson should not be distinguishable from one that does not exist.
 */
export async function requireLessonReader(
  lessonId: string,
): Promise<{ user: SessionUser; isOwner: boolean }> {
  const user = await requireUser();
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { course: { select: { creatorId: true } } },
  });
  if (!lesson) throw new AuthorizationError("Lesson not found.", 404);
  if (!(await mayReadLesson(lessonId, user.id))) {
    throw new AuthorizationError("Lesson not found.", 404);
  }
  return { user, isOwner: lesson.course.creatorId === user.id };
}
