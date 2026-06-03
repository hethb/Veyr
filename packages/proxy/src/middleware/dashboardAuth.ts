import type { NextFunction, Request, Response } from "express";
import { getServiceClient } from "../utils/supabase.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

/**
 * Verifies the dashboard's Supabase JWT (Authorization: Bearer ...) and
 * attaches `req.userId`. Used for every /api/* route.
 */
export async function dashboardAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const auth = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (!match) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const token = match[1];
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.userId = data.user.id;
    next();
  } catch (err) {
    console.error("[dashboardAuth] verify failed:", err);
    res.status(401).json({ error: "Invalid token" });
  }
}
