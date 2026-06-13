import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const KEY_PREFIX_LENGTH = 12;
export const KEY_BCRYPT_ROUNDS = 10;

/**
 * Generates a fresh Veyr API key in the form `pl_live_<32 hex chars>`.
 * Returns the raw key, its bcrypt hash, and the prefix to store for display.
 *
 * The raw key is shown to the user once and never persisted anywhere.
 */
export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const raw = `pl_live_${randomBytes(16).toString("hex")}`;
  const hash = bcrypt.hashSync(raw, KEY_BCRYPT_ROUNDS);
  const prefix = raw.slice(0, KEY_PREFIX_LENGTH);
  return { raw, hash, prefix };
}

/**
 * In-memory verification cache.
 *
 * Bcrypt compare is intentionally slow (~50-100ms) which would dominate the
 * proxy's latency budget. Once a key has been validated against the database
 * we cache the (raw -> {apiKeyId}) mapping for a short TTL so subsequent
 * requests stay on the fast path.
 *
 * Cache TTL is short enough that key revocation via DELETE /api/keys is
 * effective within a few minutes.
 */
const VERIFY_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  apiKeyId: string;
  expiresAt: number;
}

const verifyCache = new Map<string, CacheEntry>();

export function getCachedKey(raw: string): string | null {
  const entry = verifyCache.get(raw);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    verifyCache.delete(raw);
    return null;
  }
  return entry.apiKeyId;
}

export function cacheVerifiedKey(raw: string, apiKeyId: string): void {
  verifyCache.set(raw, { apiKeyId, expiresAt: Date.now() + VERIFY_TTL_MS });
}

export function invalidateKeyCache(): void {
  verifyCache.clear();
}

export function keyPrefix(raw: string): string {
  return raw.slice(0, KEY_PREFIX_LENGTH);
}
