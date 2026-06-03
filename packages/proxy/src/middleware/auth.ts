import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getServiceClient } from "../utils/supabase.js";
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
    const supabase = getServiceClient();
    const prefix = keyPrefix(raw);

    const { data, error } = await supabase
      .from("api_keys")
      .select("id, key_hash")
      .eq("key_prefix", prefix);

    if (error) {
      console.error("[auth] supabase lookup failed:", error.message);
      res.status(500).json({ error: "Internal authentication error" });
      return;
    }

    if (!data || data.length === 0) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    let matchedId: string | null = null;
    for (const row of data) {
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
  const supabase = getServiceClient();
  void supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", apiKeyId)
    .then(({ error }) => {
      if (error) console.error("[auth] last_used_at update failed:", error.message);
    });
}
