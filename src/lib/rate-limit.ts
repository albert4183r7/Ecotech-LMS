// ============================================
// Rate limiting
//
// The login endpoint had no limit of any kind, so a caller could try passwords
// as fast as the network allowed. Hashing makes each attempt cost something,
// which helps, but the answer to guessing is to stop accepting guesses.
//
// This counts attempts in memory. That is a real limitation and worth being
// plain about: the counters live in one process, so a deployment behind more
// than one replica limits per replica rather than globally, and a restart
// clears them. It is the right shape for the single-process deployment this
// runs in today, and the wrong shape for the fleet it should become — moving
// the counters to Redis is a change to this file only, because everything
// above it goes through consume().
// ============================================

export interface RateLimitRule {
  /** Attempts allowed inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Attempts left in the current window. */
  remaining: number;
  /** Seconds until the window frees up, for a Retry-After header. */
  retryAfterSeconds: number;
}

interface Bucket {
  /** Timestamps of the attempts still inside the window. */
  hits: number[];
  /** When this bucket can be dropped, so the map does not grow forever. */
  expiresAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Drop expired buckets.
 *
 * Called on a sampled basis from consume() rather than on a timer: an interval
 * would keep the process alive and would run on every replica whether or not
 * anyone was signing in.
 */
function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
  }
}

/**
 * Record an attempt against a key and say whether it is allowed.
 *
 * A sliding window rather than a fixed one: a fixed window lets an attacker
 * spend the whole allowance at the end of one window and the whole allowance
 * at the start of the next, which is twice the limit in an instant.
 */
export function consume(key: string, rule: RateLimitRule, now: number = Date.now()): RateLimitResult {
  if (buckets.size > 10_000) sweep(now);

  const cutoff = now - rule.windowMs;
  const bucket = buckets.get(key);
  const hits = (bucket?.hits ?? []).filter((t) => t > cutoff);

  if (hits.length >= rule.limit) {
    const oldest = hits[0];
    buckets.set(key, { hits, expiresAt: oldest + rule.windowMs });
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000)),
    };
  }

  hits.push(now);
  buckets.set(key, { hits, expiresAt: now + rule.windowMs });

  return { allowed: true, remaining: rule.limit - hits.length, retryAfterSeconds: 0 };
}

/** Forget a key's attempts. Called after a success, so a legitimate user who
 *  mistyped a few times is not still rationed once they get it right. */
export function reset(key: string): void {
  buckets.delete(key);
}

/**
 * The client's address, as far as it can be trusted.
 *
 * Behind the reverse proxy this app runs under, the socket address is always
 * the proxy, so the forwarded headers are the only source of the real one.
 * They are client-settable in principle, which is why the address is never the
 * *only* thing limited — the login route also limits per account, so spoofing
 * the header does not buy unlimited guesses at one password.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** Attempts per address. Generous: a school or office shares one address. */
export const LOGIN_IP_RULE: RateLimitRule = { limit: 20, windowMs: 10 * 60_000 };

/** Attempts per account. Tight: nobody needs ten guesses at their own password. */
export const LOGIN_ACCOUNT_RULE: RateLimitRule = { limit: 6, windowMs: 10 * 60_000 };
