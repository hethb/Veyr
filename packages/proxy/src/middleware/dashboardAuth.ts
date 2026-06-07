import type { NextFunction, Request, Response } from "express";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  isAuthEnabled,
} from "../config.js";

declare module "express-serve-static-core" {
  interface Request {
    /** Supabase user id, set when AUTH_ENABLED and a valid token is present. */
    userId?: string;
  }
}

interface CacheEntry {
  userId: string;
  expires: number;
}
const tokenCache = new Map<string, CacheEntry>();
const TOKEN_TTL_MS = 5 * 60 * 1000;

function bearer(req: Request): string {
  const h = req.header("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : "";
}

/**
 * Verifies a Supabase access token by calling the Auth API. Returns the user id
 * or null. Results are cached briefly to avoid a network round-trip per request.
 */
async function verifyToken(token: string): Promise<string | null> {
  const cached = tokenCache.get(token);
  if (cached && cached.expires > Date.now()) return cached.userId;

  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) return null;

  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string };
    if (!body.id) return null;
    tokenCache.set(token, { userId: body.id, expires: Date.now() + TOKEN_TTL_MS });
    return body.id;
  } catch (err) {
    console.error("[dashboardAuth] token verification failed:", err);
    return null;
  }
}

/**
 * Gates the dashboard `/api/*` routes.
 *  - AUTH_ENABLED off: pass through with no userId (single-tenant local mode).
 *  - AUTH_ENABLED on: require a valid Supabase token and attach req.userId.
 */
export async function dashboardAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!isAuthEnabled()) {
    next();
    return;
  }

  const token = bearer(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const userId = await verifyToken(token);
  if (!userId) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  req.userId = userId;
  next();
}
