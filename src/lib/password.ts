import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// ============================================
// Password hashing
//
// Passwords were stored and compared as plaintext, so a copy of the database
// was a copy of every account. They are hashed here instead, with scrypt from
// node's own crypto module: it is a memory-hard KDF designed for exactly this,
// and using it costs no dependency — which matters because a native module
// would have to be rebuilt for every image the standalone build runs in.
//
// Stored form is self-describing:
//
//   scrypt$N$r$p$<salt base64url>$<hash base64url>
//
// The parameters travel with the hash so raising them later does not
// invalidate the passwords already stored: an old hash still verifies against
// the cost it was written with, and needsRehash() reports that it should be
// upgraded the next time the user proves the password.
// ============================================

// promisify() cannot pick between scrypt's overloads, and infers the one
// without an options argument — so the cost parameters below would be a type
// error. Naming the signature keeps them.
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Cost parameters.
 *
 * N=2^15 with r=8 is roughly 32 MB and tens of milliseconds per verification
 * on a small server — high enough to make offline cracking expensive, low
 * enough that a burst of logins does not exhaust memory. Raise N to increase
 * both; anything already stored keeps verifying at its own cost.
 */
const N = 32768;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * scrypt's memory use is roughly 128 * N * r bytes. Node refuses to allocate
 * past its default 32 MB limit, which N=2^15 sits exactly on, so the ceiling
 * is raised rather than left to fail on the boundary.
 */
const MAX_MEMORY = 192 * 1024 * 1024;

const PREFIX = "scrypt";

async function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return (await scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: n,
    r,
    p,
    maxmem: MAX_MEMORY,
  }));
}

/** Hash a password for storage. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, N, R, P);
  return [PREFIX, N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** Whether a stored value is one of our hashes rather than legacy plaintext. */
export function isHashed(stored: string): boolean {
  return stored.startsWith(`${PREFIX}$`);
}

/**
 * Check a password against a stored value.
 *
 * Accepts the legacy plaintext rows the seed used to write, so existing
 * accounts keep working through the migration; those compare in constant time
 * too, so the fallback path does not leak the stored value's length by timing.
 * Callers pair this with needsRehash() to upgrade the row on a successful
 * login — see api/auth/login.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;

  if (!isHashed(stored)) {
    const a = Buffer.from(password);
    const b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  const parts = stored.split("$");
  if (parts.length !== 6) return false;

  const [, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // A hash claiming an absurd cost would otherwise let a poisoned row turn one
  // login into an out-of-memory kill.
  if (n < 2 || n > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;

  const salt = Buffer.from(rawSalt, "base64url");
  const expected = Buffer.from(rawKey, "base64url");
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = await derive(password, salt, n, r, p);
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Whether a stored value should be replaced once the password is known.
 *
 * True for legacy plaintext and for a hash written at a lower cost than the
 * current parameters, so both migrate on the user's next successful login
 * rather than needing a reset.
 */
export function needsRehash(stored: string): boolean {
  if (!isHashed(stored)) return true;

  const parts = stored.split("$");
  if (parts.length !== 6) return true;

  const [, rawN, rawR, rawP] = parts;
  return Number(rawN) < N || Number(rawR) < R || Number(rawP) < P;
}
