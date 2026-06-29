import { Router, type Request, type Response } from "express";
import { apiKeyAuth } from "../middleware/auth.js";
import {
  getRecentRequests,
  getRequestsSinceForKey,
  type RequestRow,
} from "../storage/store.js";

// ---------------------------------------------------------------------------
// Key-authenticated stats — the read counterpart to /ingest/web-chat.
//
// The dashboard /api/stats routes require a Supabase session (dashboardAuth),
// which the browser extension and other API-key clients don't have. These
// routes authenticate with the same `x-veyr-key` the client already uses
// to write, and scope every figure to that one key — so what a client reads
// here is exactly the subset of dashboard data it produced. That keeps the
// extension's numbers consistent with the dashboard by construction.
// ---------------------------------------------------------------------------

export const keyStatsRouter: Router = Router();

keyStatsRouter.use(apiKeyAuth);

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function bucket(rows: RequestRow[], cutoff: number): { cost: number; requests: number; tokens: number } {
  const acc = { cost: 0, requests: 0, tokens: 0 };
  for (const r of rows) {
    if (new Date(r.timestamp).getTime() < cutoff) continue;
    acc.cost += typeof r.cost_usd === "string" ? parseFloat(r.cost_usd) : r.cost_usd;
    acc.requests += 1;
    acc.tokens += r.total_tokens;
  }
  return { cost: round(acc.cost), requests: acc.requests, tokens: acc.tokens };
}

// GET /api/key-stats/overview — today / week / month, scoped to this key.
keyStatsRouter.get("/overview", (req: Request, res: Response): void => {
  const apiKeyId = req.apiKeyId;
  if (!apiKeyId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  try {
    const now = Date.now();
    const monthCutoff = now - 30 * 24 * 60 * 60 * 1000;
    const rows = getRequestsSinceForKey(new Date(monthCutoff).toISOString(), apiKeyId);

    const startToday = new Date();
    startToday.setUTCHours(0, 0, 0, 0);

    res.json({
      today: bucket(rows, startToday.getTime()),
      week: bucket(rows, now - 7 * 24 * 60 * 60 * 1000),
      month: bucket(rows, monthCutoff),
    });
  } catch (err) {
    console.error("[key-stats/overview] failed:", err);
    res.status(500).json({ error: "Failed to load overview" });
  }
});

// GET /api/key-stats/recent?limit=20&tag=<tag> — scoped to this key.
keyStatsRouter.get("/recent", (req: Request, res: Response): void => {
  const apiKeyId = req.apiKeyId;
  if (!apiKeyId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 20;
  const tag = typeof req.query.tag === "string" && req.query.tag.trim() ? req.query.tag.trim() : null;

  try {
    res.json(getRecentRequests({ limit, tag, apiKeyId }));
  } catch (err) {
    console.error("[key-stats/recent] failed:", err);
    res.status(500).json({ error: "Failed to load recent requests" });
  }
});
