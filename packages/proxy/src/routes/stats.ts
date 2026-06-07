import { Router, type Request, type Response } from "express";
import { getRequestsSince, type RequestRow } from "../storage/store.js";

type Period = "1d" | "7d" | "30d";
type Granularity = "hour" | "day";

export const statsRouter: Router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function periodMs(p: Period): number {
  switch (p) {
    case "1d": return 1 * 24 * 60 * 60 * 1000;
    case "7d": return 7 * 24 * 60 * 60 * 1000;
    case "30d": return 30 * 24 * 60 * 60 * 1000;
  }
}

function parsePeriod(value: unknown, fallback: Period = "7d"): Period {
  return value === "1d" || value === "7d" || value === "30d" ? value : fallback;
}

function parseGranularity(value: unknown): Granularity {
  return value === "hour" ? "hour" : "day";
}

function num(v: number | string): number {
  return typeof v === "string" ? parseFloat(v) : v;
}

function bucketKey(ts: string, granularity: Granularity): string {
  const d = new Date(ts);
  if (granularity === "hour") {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:00`;
  }
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// GET /api/stats/overview
// ---------------------------------------------------------------------------

statsRouter.get("/overview", (_req: Request, res: Response): void => {
  try {
    const sinceMonth = new Date(Date.now() - periodMs("30d")).toISOString();
    const rows = getRequestsSince(sinceMonth);

    const now = Date.now();
    const startToday = new Date();
    startToday.setUTCHours(0, 0, 0, 0);

    const weekCutoff = now - periodMs("7d");
    const monthCutoff = now - periodMs("30d");

    const acc = {
      today: { cost: 0, requests: 0, tokens: 0 },
      week:  { cost: 0, requests: 0, tokens: 0 },
      month: { cost: 0, requests: 0, tokens: 0 },
    };

    for (const r of rows) {
      const t = new Date(r.timestamp).getTime();
      const cost = num(r.cost_usd);
      const tokens = r.total_tokens;
      if (t >= monthCutoff) {
        acc.month.cost += cost;
        acc.month.requests += 1;
        acc.month.tokens += tokens;
      }
      if (t >= weekCutoff) {
        acc.week.cost += cost;
        acc.week.requests += 1;
        acc.week.tokens += tokens;
      }
      if (t >= startToday.getTime()) {
        acc.today.cost += cost;
        acc.today.requests += 1;
        acc.today.tokens += tokens;
      }
    }

    res.json({
      today: { cost: round(acc.today.cost), requests: acc.today.requests, tokens: acc.today.tokens },
      week:  { cost: round(acc.week.cost),  requests: acc.week.requests,  tokens: acc.week.tokens },
      month: { cost: round(acc.month.cost), requests: acc.month.requests, tokens: acc.month.tokens },
    });
  } catch (err) {
    console.error("[stats/overview] failed:", err);
    res.status(500).json({ error: "Failed to load overview" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/stats/by-tag
// ---------------------------------------------------------------------------

statsRouter.get("/by-tag", (req: Request, res: Response): void => {
  const period = parsePeriod(req.query.period);
  try {
    const since = new Date(Date.now() - periodMs(period)).toISOString();
    const rows = getRequestsSince(since);

    const grouped = new Map<string, { cost: number; requests: number }>();
    for (const r of rows) {
      const tag = r.feature_tag ?? "untagged";
      const entry = grouped.get(tag) ?? { cost: 0, requests: 0 };
      entry.cost += num(r.cost_usd);
      entry.requests += 1;
      grouped.set(tag, entry);
    }

    const out = [...grouped.entries()]
      .map(([feature_tag, v]) => ({
        feature_tag,
        cost: round(v.cost),
        requests: v.requests,
      }))
      .sort((a, b) => b.cost - a.cost);

    res.json(out);
  } catch (err) {
    console.error("[stats/by-tag] failed:", err);
    res.status(500).json({ error: "Failed to load by-tag stats" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/stats/timeseries
// ---------------------------------------------------------------------------

statsRouter.get("/timeseries", (req: Request, res: Response): void => {
  const period = parsePeriod(req.query.period);
  const granularity = parseGranularity(req.query.granularity);

  try {
    const since = new Date(Date.now() - periodMs(period)).toISOString();
    const rows = getRequestsSince(since);

    const grouped = new Map<string, { cost: number; requests: number }>();
    for (const r of rows) {
      const key = bucketKey(r.timestamp, granularity);
      const entry = grouped.get(key) ?? { cost: 0, requests: 0 };
      entry.cost += num(r.cost_usd);
      entry.requests += 1;
      grouped.set(key, entry);
    }

    const series = fillBuckets(grouped, period, granularity);
    res.json(series);
  } catch (err) {
    console.error("[stats/timeseries] failed:", err);
    res.status(500).json({ error: "Failed to load timeseries" });
  }
});

interface BucketPoint {
  date: string;
  cost: number;
  requests: number;
}

function fillBuckets(
  grouped: Map<string, { cost: number; requests: number }>,
  period: Period,
  granularity: Granularity
): BucketPoint[] {
  const points: BucketPoint[] = [];
  const stepMs = granularity === "hour" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const start = Date.now() - periodMs(period);

  for (let t = start; t <= Date.now(); t += stepMs) {
    const key = bucketKey(new Date(t).toISOString(), granularity);
    const entry = grouped.get(key) ?? { cost: 0, requests: 0 };
    points.push({
      date: key,
      cost: round(entry.cost),
      requests: entry.requests,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------
// GET /api/stats/top-templates
// ---------------------------------------------------------------------------

statsRouter.get("/top-templates", (req: Request, res: Response): void => {
  const limit = Math.max(1, Math.min(100, parseInt(String(req.query.limit ?? "10"), 10) || 10));

  try {
    const since = new Date(Date.now() - periodMs("30d")).toISOString();
    const rows: RequestRow[] = getRequestsSince(since);

    interface Agg {
      total_cost: number;
      request_count: number;
      total_tokens: number;
      feature_tag: string | null;
    }
    const grouped = new Map<string, Agg>();

    for (const r of rows) {
      const hash = r.prompt_hash ?? "";
      if (!hash) continue;
      const entry = grouped.get(hash) ?? {
        total_cost: 0,
        request_count: 0,
        total_tokens: 0,
        feature_tag: r.feature_tag ?? null,
      };
      entry.total_cost += num(r.cost_usd);
      entry.request_count += 1;
      entry.total_tokens += r.total_tokens;
      grouped.set(hash, entry);
    }

    const out = [...grouped.entries()]
      .map(([prompt_hash, v]) => ({
        prompt_hash,
        total_cost: round(v.total_cost),
        request_count: v.request_count,
        avg_tokens: v.request_count
          ? Math.round(v.total_tokens / v.request_count)
          : 0,
        feature_tag: v.feature_tag,
      }))
      .sort((a, b) => b.total_cost - a.total_cost)
      .slice(0, limit);

    res.json(out);
  } catch (err) {
    console.error("[stats/top-templates] failed:", err);
    res.status(500).json({ error: "Failed to load top templates" });
  }
});

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
