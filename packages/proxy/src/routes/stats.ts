import { Router, type Request, type Response } from "express";
import {
  getRecentRequests,
  getRequestsForAnalysis,
  getRequestsSince,
  type AnalysisRow,
  type RequestRow,
} from "../storage/store.js";
import { inputCostPerToken } from "../utils/costs.js";

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

statsRouter.get("/overview", (req: Request, res: Response): void => {
  try {
    const sinceMonth = new Date(Date.now() - periodMs("30d")).toISOString();
    const rows = getRequestsSince(sinceMonth, req.userId);

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
// GET /api/stats/recent?limit=20&tag=<feature-tag>
//   Most recent requests, newest first. Backs `veyr logs [--follow]`.
// ---------------------------------------------------------------------------

statsRouter.get("/recent", (req: Request, res: Response): void => {
  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 20;
  const tag = typeof req.query.tag === "string" && req.query.tag.trim() ? req.query.tag.trim() : null;

  try {
    res.json(getRecentRequests({ limit, tag, userId: req.userId }));
  } catch (err) {
    console.error("[stats/recent] failed:", err);
    res.status(500).json({ error: "Failed to load recent requests" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/stats/by-tag
// ---------------------------------------------------------------------------

statsRouter.get("/by-tag", (req: Request, res: Response): void => {
  const period = parsePeriod(req.query.period);
  try {
    const since = new Date(Date.now() - periodMs(period)).toISOString();
    const rows = getRequestsSince(since, req.userId);

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
    const rows = getRequestsSince(since, req.userId);

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
    const rows: RequestRow[] = getRequestsSince(since, req.userId);

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

// ---------------------------------------------------------------------------
// GET /api/stats/cache
//   Aggregated prompt-caching impact: tokens served from cache, tokens
//   written, net dollar savings, hit rate, and a per-feature / daily
//   breakdown so the dashboard can show concretely what caching is doing.
// ---------------------------------------------------------------------------

/**
 * Provider-side multipliers (mirror utils/costs.ts):
 *   - Anthropic ephemeral cache: read = 0.10x input, write = 1.25x input
 *   - OpenAI auto cache: read = 0.50x input (no write premium)
 *
 * We compute "savings" as (1 - readMultiplier) * pricePerToken for cache
 * reads, and write premium as (writeMultiplier - 1) * pricePerToken. Net
 * savings = reads_savings - write_premium.
 */
const CACHE_WRITE_MULT = 1.25;
const CACHE_READ_MULT_ANTHROPIC = 0.10;
const CACHE_READ_MULT_OPENAI = 0.50;

function cacheReadMultiplier(model: string): number {
  return model.toLowerCase().includes("claude")
    ? CACHE_READ_MULT_ANTHROPIC
    : CACHE_READ_MULT_OPENAI;
}

interface CacheRowAgg {
  feature_tag: string;
  prompt_tokens: number;
  cached_tokens: number;
  cache_creation_tokens: number;
  savings_usd: number;
  write_premium_usd: number;
}

interface CacheTimePoint {
  date: string;
  cached_tokens: number;
  prompt_tokens: number;
  savings_usd: number;
}

// ---------------------------------------------------------------------------
// GET /api/stats/optimization — complexity-aware optimizer metrics (Part 4c)
// ---------------------------------------------------------------------------

interface OptimizationTagAgg {
  feature_tag: string;
  requests: number;
  original_tokens: number;
  optimized_tokens: number;
  avg_reduction_pct: number;
  monthly_savings_usd: number;
}

interface OptimizationTimePoint {
  bucket: string;
  original_tokens: number;
  optimized_tokens: number;
}

statsRouter.get("/optimization", (req: Request, res: Response): void => {
  const period = parsePeriod(req.query.period, "30d");
  try {
    const since = new Date(Date.now() - periodMs(period)).toISOString();
    const rows: AnalysisRow[] = getRequestsForAnalysis(since, req.userId);

    let tokensSaved = 0;
    let originalTokens = 0;
    let optimizedTokens = 0;
    let cacheHits = 0;
    let costAvoided = 0;
    let turnsTrimmed = 0;
    let trimTokensSaved = 0;
    let batchEligible = 0;
    let structuredOutputCandidates = 0;
    const byTag = new Map<string, OptimizationTagAgg>();
    const byDay = new Map<string, OptimizationTimePoint>();
    const byTechnique = new Map<string, number>();

    for (const r of rows) {
      const saved = r.tokens_saved_estimate ?? 0;
      const orig = r.original_prompt_tokens ?? 0;
      const opt = r.optimized_prompt_tokens ?? 0;
      const perToken = inputCostPerToken(r.model);

      if (saved > 0) {
        tokensSaved += saved;
        costAvoided += saved * perToken;
      }
      if ((r.cached_tokens ?? 0) > 0) cacheHits += 1;
      originalTokens += orig;
      optimizedTokens += opt;
      turnsTrimmed += r.messages_dropped ?? 0;
      trimTokensSaved += r.trim_tokens_saved ?? 0;
      if ((r.trim_tokens_saved ?? 0) > 0) costAvoided += (r.trim_tokens_saved ?? 0) * perToken;
      if ((r.batch_candidate ?? 0) > 0) batchEligible += 1;
      if ((r.structured_output_candidate ?? 0) > 0) structuredOutputCandidates += 1;

      const day = bucketKey(r.timestamp, "day");
      const point = byDay.get(day) ?? {
        bucket: day,
        original_tokens: 0,
        optimized_tokens: 0,
      };
      point.original_tokens += orig > 0 ? orig : r.prompt_tokens;
      point.optimized_tokens += orig > 0 ? opt : r.prompt_tokens;
      byDay.set(day, point);

      const tag = r.feature_tag ?? "untagged";
      const agg = byTag.get(tag) ?? {
        feature_tag: tag,
        requests: 0,
        original_tokens: 0,
        optimized_tokens: 0,
        avg_reduction_pct: 0,
        monthly_savings_usd: 0,
      };
      agg.requests += 1;
      agg.original_tokens += orig;
      agg.optimized_tokens += opt;
      agg.monthly_savings_usd += saved * perToken;
      byTag.set(tag, agg);

      // Technique attribution: split the row's savings evenly across the
      // techniques that fired; cache reads count as "cache_injection".
      if (r.techniques_applied) {
        try {
          const techniques = JSON.parse(r.techniques_applied) as string[];
          if (Array.isArray(techniques) && techniques.length > 0 && saved > 0) {
            const share = saved / techniques.length;
            for (const technique of techniques) {
              byTechnique.set(
                technique,
                (byTechnique.get(technique) ?? 0) + share
              );
            }
          }
        } catch {
          // Malformed JSON — skip attribution for this row.
        }
      }
      if ((r.cached_tokens ?? 0) > 0) {
        byTechnique.set(
          "cache_injection",
          (byTechnique.get("cache_injection") ?? 0) + (r.cached_tokens ?? 0) * 0.9
        );
      }
      if ((r.trim_tokens_saved ?? 0) > 0) {
        byTechnique.set(
          "conversation_trimming",
          (byTechnique.get("conversation_trimming") ?? 0) + (r.trim_tokens_saved ?? 0)
        );
      }
    }

    const tags = [...byTag.values()]
      .map((agg) => ({
        ...agg,
        avg_reduction_pct:
          agg.original_tokens > 0
            ? Math.round(
                ((agg.original_tokens - agg.optimized_tokens) /
                  agg.original_tokens) *
                  100
              )
            : 0,
        monthly_savings_usd: Math.round(agg.monthly_savings_usd * 10000) / 10000,
      }))
      .filter((agg) => agg.original_tokens > 0 || agg.monthly_savings_usd > 0)
      .sort((a, b) => b.monthly_savings_usd - a.monthly_savings_usd)
      .slice(0, 12);

    res.json({
      period,
      tokens_saved: tokensSaved,
      compression_ratio_pct:
        originalTokens > 0
          ? Math.round(((originalTokens - optimizedTokens) / originalTokens) * 100)
          : 0,
      cache_hits: cacheHits,
      cost_avoided_usd: Math.round(costAvoided * 10000) / 10000,
      turns_trimmed: turnsTrimmed,
      trim_tokens_saved: trimTokensSaved,
      batch_eligible_requests: batchEligible,
      structured_output_candidates: structuredOutputCandidates,
      series: [...byDay.values()].sort((a, b) =>
        a.bucket.localeCompare(b.bucket)
      ),
      by_tag: tags,
      techniques: [...byTechnique.entries()]
        .map(([name, tokens]) => ({ name, tokens_saved: Math.round(tokens) }))
        .sort((a, b) => b.tokens_saved - a.tokens_saved),
    });
  } catch (err) {
    console.error("[stats/optimization]", err);
    res.status(500).json({ error: "Failed to compute optimization stats" });
  }
});

statsRouter.get("/cache", (req: Request, res: Response): void => {
  const period = parsePeriod(req.query.period, "30d");
  try {
    const since = new Date(Date.now() - periodMs(period)).toISOString();
    // We need the model on each row to apply provider-specific multipliers,
    // so reuse the richer analysis row shape.
    const rows: AnalysisRow[] = getRequestsForAnalysis(since, req.userId);

    let totalPrompt = 0;
    let totalCached = 0;
    let totalCreation = 0;
    let totalSavings = 0;
    let totalWritePremium = 0;
    // Hypothetical cost of input tokens at FULL price (what you'd pay without
    // caching) — useful for showing "without caching, this would cost X".
    let baselineInputCost = 0;
    let cacheUsingRequests = 0;

    const byTag = new Map<string, CacheRowAgg>();
    const byDay = new Map<string, CacheTimePoint>();

    for (const r of rows) {
      const cached = r.cached_tokens ?? 0;
      const creation = r.cache_creation_tokens ?? 0;
      const pricePerInputToken = inputCostPerToken(r.model);
      const readMult = cacheReadMultiplier(r.model);

      const rowSavings = cached * pricePerInputToken * (1 - readMult);
      const rowPremium = creation * pricePerInputToken * (CACHE_WRITE_MULT - 1);

      totalPrompt += r.prompt_tokens;
      totalCached += cached;
      totalCreation += creation;
      totalSavings += rowSavings;
      totalWritePremium += rowPremium;
      baselineInputCost += r.prompt_tokens * pricePerInputToken;
      if (cached > 0 || creation > 0) cacheUsingRequests += 1;

      const tag = r.feature_tag ?? "untagged";
      let tagAgg = byTag.get(tag);
      if (!tagAgg) {
        tagAgg = {
          feature_tag: tag,
          prompt_tokens: 0,
          cached_tokens: 0,
          cache_creation_tokens: 0,
          savings_usd: 0,
          write_premium_usd: 0,
        };
        byTag.set(tag, tagAgg);
      }
      tagAgg.prompt_tokens += r.prompt_tokens;
      tagAgg.cached_tokens += cached;
      tagAgg.cache_creation_tokens += creation;
      tagAgg.savings_usd += rowSavings;
      tagAgg.write_premium_usd += rowPremium;

      const day = r.timestamp.slice(0, 10);
      let dayAgg = byDay.get(day);
      if (!dayAgg) {
        dayAgg = { date: day, cached_tokens: 0, prompt_tokens: 0, savings_usd: 0 };
        byDay.set(day, dayAgg);
      }
      dayAgg.cached_tokens += cached;
      dayAgg.prompt_tokens += r.prompt_tokens;
      dayAgg.savings_usd += rowSavings - rowPremium;
    }

    const netSavings = totalSavings - totalWritePremium;
    const hitRate = totalPrompt > 0 ? totalCached / totalPrompt : 0;

    // Top tags ordered by absolute savings (positive impact first), then by
    // potential — tags with high prompt volume but zero cache reads — so the
    // panel surfaces "you're caching this well" AND "you could be caching this".
    const tagsArr = [...byTag.values()].sort((a, b) => {
      const aImpact = a.savings_usd - a.write_premium_usd;
      const bImpact = b.savings_usd - b.write_premium_usd;
      if (aImpact !== bImpact) return bImpact - aImpact;
      return b.prompt_tokens - a.prompt_tokens;
    });

    // Fill in the daily timeseries between since and now.
    const series: CacheTimePoint[] = [];
    const start = Date.now() - periodMs(period);
    for (let t = start; t <= Date.now(); t += 24 * 60 * 60 * 1000) {
      const key = new Date(t).toISOString().slice(0, 10);
      const point = byDay.get(key);
      series.push({
        date: key,
        cached_tokens: point?.cached_tokens ?? 0,
        prompt_tokens: point?.prompt_tokens ?? 0,
        savings_usd: round(point?.savings_usd ?? 0),
      });
    }

    res.json({
      period,
      hit_rate: round(hitRate),
      cached_tokens: totalCached,
      cache_creation_tokens: totalCreation,
      regular_input_tokens: Math.max(0, totalPrompt - totalCached - totalCreation),
      total_prompt_tokens: totalPrompt,
      savings_usd: round(totalSavings),
      write_premium_usd: round(totalWritePremium),
      net_savings_usd: round(netSavings),
      baseline_input_cost_usd: round(baselineInputCost),
      cache_using_requests: cacheUsingRequests,
      total_requests: rows.length,
      by_feature: tagsArr.slice(0, 12).map((t) => {
        const tagHit = t.prompt_tokens > 0 ? t.cached_tokens / t.prompt_tokens : 0;
        return {
          feature_tag: t.feature_tag,
          prompt_tokens: t.prompt_tokens,
          cached_tokens: t.cached_tokens,
          cache_creation_tokens: t.cache_creation_tokens,
          hit_rate: round(tagHit),
          savings_usd: round(t.savings_usd),
          write_premium_usd: round(t.write_premium_usd),
          net_savings_usd: round(t.savings_usd - t.write_premium_usd),
        };
      }),
      timeseries: series,
    });
  } catch (err) {
    console.error("[stats/cache] failed:", err);
    res.status(500).json({ error: "Failed to load cache stats" });
  }
});
