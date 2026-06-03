import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
  interface Request {
    featureTag?: string;
  }
}

const MAX_LEN = 64;

/**
 * Resolves a `feature_tag` for the incoming request, in priority order:
 *   1. Explicit `x-feature-tag` header
 *   2. `x-request-path` header
 *   3. `Referer` URL pathname
 *   4. fallback: "untagged"
 *
 * Path-derived tags are normalized: leading `/` stripped, query stripped,
 * remaining `/` replaced with `_`, truncated to 64 chars.
 */
export function featureTag(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const explicit = headerString(req, "x-feature-tag");
  if (explicit) {
    req.featureTag = sanitize(explicit);
    next();
    return;
  }

  const path = headerString(req, "x-request-path") ?? extractRefererPath(req);
  req.featureTag = path ? pathToTag(path) : "untagged";
  next();
}

function headerString(req: Request, name: string): string | null {
  const v = req.header(name);
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractRefererPath(req: Request): string | null {
  const ref = headerString(req, "referer");
  if (!ref) return null;
  try {
    return new URL(ref).pathname;
  } catch {
    return null;
  }
}

function pathToTag(path: string): string {
  let p = path;
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  if (p.startsWith("/")) p = p.slice(1);
  if (p.length === 0) return "root";
  return sanitize(p.replace(/\//g, "_"));
}

function sanitize(tag: string): string {
  return tag.slice(0, MAX_LEN);
}
