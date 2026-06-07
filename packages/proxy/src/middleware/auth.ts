import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { findApiKeysByPrefix, touchKeyLastUsed } from "../storage/store.js";
import { cacheVerifiedKey, getCachedKey, keyPrefix } from "../utils/keys.js";

declare module "express-serve-static-core" {
  interface Request {
    apiKeyId?: string;
  }
}

/**
 * Authenticates a proxy request using the `x-promptlens-key` header.
 *
 * Strategy:
 *  1. Hot path: in-memory cache lookup (avoids per-request bcrypt).
 *  2. Cold path: narrow candidates by `key_prefix`, then bcrypt.compare.
 *
 * On success, attaches `req.apiKeyId` and fires-and-forgets a `last_used_at`
 * update so we never delay the synchronous path.
 */
export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const headerVal = req.header("x-promptlens-key");
  const raw = typeof headerVal === "string" ? headerVal.trim() : "";

  if (!raw) {
    res.status(401).json({ error: "Missing x-promptlens-key header" });
    return;
  }

  const cached = getCachedKey(raw);
  if (cached) {
    req.apiKeyId = cached;
    touchLastUsed(cached);
    next();
    return;
  }

  try {
    const prefix = keyPrefix(raw);
    const candidates = findApiKeysByPrefix(prefix);

    if (candidates.length === 0) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    let matchedId: string | null = null;
    for (const row of candidates) {
      if (await bcrypt.compare(raw, row.key_hash)) {
        matchedId = row.id;
        break;
      }
    }

    if (!matchedId) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    cacheVerifiedKey(raw, matchedId);
    req.apiKeyId = matchedId;
    touchLastUsed(matchedId);
    next();
  } catch (err) {
    console.error("[auth] unexpected error:", err);
    res.status(500).json({ error: "Internal authentication error" });
  }
}

function touchLastUsed(apiKeyId: string): void {
  try {
    touchKeyLastUsed(apiKeyId);
  } catch (err) {
    console.error("[auth] last_used_at update failed:", err);
  }
}
