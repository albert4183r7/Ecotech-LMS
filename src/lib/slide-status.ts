// ============================================
// Slide generation status rules
// ============================================

export type SlideStatus = "DRAFT_OUTLINE" | "GENERATING" | "READY" | "ERROR";

/** Attempts per slide within one pass before it is left in ERROR. */
export const SLIDE_ATTEMPTS = 2;

/** A slide stuck in GENERATING for longer than this is assumed abandoned by a
 *  process that died mid-run, and is reclaimed on the next pass. */
export const STALE_GENERATING_MS = 5 * 60_000;

/**
 * Whether a generation pass should pick this slide up.
 *
 * ERROR is included deliberately: without it a slide that failed once stayed
 * failed forever, which is how 14 slides ended up stranded. GENERATING is
 * reclaimed only once it is stale, so a healthy concurrent run is not disturbed.
 */
export function isRetryable(status: string, updatedAt: Date, now: number = Date.now()): boolean {
  if (status === "DRAFT_OUTLINE" || status === "ERROR") return true;
  if (status === "GENERATING") return now - updatedAt.getTime() > STALE_GENERATING_MS;
  return false;
}
