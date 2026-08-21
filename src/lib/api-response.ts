import { NextResponse } from "next/server";
import { AuthorizationError } from "./session";

// ============================================
// API responses
//
// One place that turns a thrown AuthorizationError into the right status, so
// every protected route reports refusal the same way and none of them has to
// remember to.
// ============================================

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}

export function fail(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * Run a route handler, mapping authorization failures to their status.
 *
 * Anything else is logged with its route label and reported as a 500 without
 * the internal message, which otherwise leaks database and file-system detail
 * to the client.
 */
export async function handleRoute(
  label: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return fail(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${label}]`, message);
    return fail("Something went wrong. Please try again.", 500);
  }
}

/**
 * The response for a thrown AuthorizationError, or null when it is not one.
 *
 * handleRoute is the shape to prefer, but several handlers own their own
 * try/catch and used to answer a refusal with 500 — telling the client the
 * server had broken when in fact the session had expired, so the page showed
 * "something went wrong" instead of asking the user to sign in again.
 */
export function authFailure(error: unknown): NextResponse | null {
  return error instanceof AuthorizationError ? fail(error.message, error.status) : null;
}
