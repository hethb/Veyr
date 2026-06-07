import { Router, type Request, type Response } from "express";
import {
  getRequestsForAnalysis,
  type AnalysisRow,
} from "../storage/store.js";
import { inputCostPerToken, outputCostPerToken } from "../utils/costs.js";
import { compressSystemPrompt } from "../optimization/compressPrompt.js";
import { lintPrompt } from "../optimization/promptLint.js";

export const analysisRouter: Router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Severity = "high" | "medium" | "low";
type Category = "model" | "token-waste" | "session" | "caching" | "volume";

interface Suggestion {
  id: string;
  severity: Severity;
  category: Category;
  title: string;
  description: string;
  impact_usd: number;
  evidence: Record<string, unknown>;
  action: string;
  quick_win?: boolean;
}

// ---------------------------------------------------------------------------
// Constants / helpers
// ---------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_30D_MS = 30 * DAY_MS;
const WINDOW_7D_MS = 7 * DAY_MS;
const BURST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const BURST_MIN_CALLS = 20;
const BURST_MIN_OCCURRENCES = 3;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** True for frontier models that are overkill for simple, low-token prompts. */
function isFrontierModel(model: string): boolean {
  const m = model.toLowerCase();
  if (m.includes("mini") || m.includes("haiku")) return false;
  return (
    m.startsWith("gpt-4o") ||
    m.startsWith("gpt-4-turbo") ||
    m.includes("sonnet") ||
    m.includes("opus")
  );
}

interface TagAgg {
  tag: string;
  rows: AnalysisRow[];
  count: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  successCount: number;
  errorCount: number;
  modelCounts: Map<string, number>;
}

interface HashAgg {
  hash: string;
  count: number;
  promptTokens: number;
  featureTag: string | null;
  modelCounts: Map<string, number>;
}

function dominantModel(modelCounts: Map<string, number>): string {
  let best = "unknown";
  let bestN = -1;
  for (const [model, n] of modelCounts) {
    if (n > bestN) {
      best = model;
      bestN = n;
    }
  }
  return best;
}

function frontierShare(agg: TagAgg): number {
  if (agg.count === 0) return 0;
  let frontier = 0;
  for (const [model, n] of agg.modelCounts) {
    if (isFrontierModel(model)) frontier += n;
  }
  return frontier / agg.count;
}

/**
 * Counts non-overlapping bursts: windows of <= BURST_WINDOW_MS containing more
 * than BURST_MIN_CALLS requests. Returns the burst count and the largest burst.
 */
function detectBursts(timestamps: number[]): { bursts: number; maxCalls: number } {
  const ts = [...timestamps].sort((a, b) => a - b);
  let bursts = 0;
  let maxCalls = 0;
  let i = 0;
  while (i < ts.length) {
    let j = i;
    while (j < ts.length && ts[j] - ts[i] <= BURST_WINDOW_MS) j++;
    const calls = j - i;
    if (calls > BURST_MIN_CALLS) {
      bursts++;
      if (calls > maxCalls) maxCalls = calls;
      i = j; // skip past this burst to avoid double-counting
    } else {
      i++;
    }
  }
  return { bursts, maxCalls };
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
function buildSuggestions(rows: AnalysisRow[]): Suggestion[] {
  const now = Date.now();
  const cutoff7d = now - WINDOW_7D_MS;

  // Per-tag aggregation over the 30d window.
  const tags = new Map<string, TagAgg>();
  const hashes = new Map<string, HashAgg>();
  let totalCost = 0;

  for (const r of rows) {
    const tag = r.feature_tag ?? "untagged";
    let agg = tags.get(tag);
    if (!agg) {
      agg = {
        tag,
        rows: [],
        count: 0,
        promptTokens: 0,
        completionTokens: 0,
        cost: 0,
        successCount: 0,
        errorCount: 0,
        modelCounts: new Map(),
      };
      tags.set(tag, agg);
    }
    agg.rows.push(r);
    agg.count += 1;
    agg.promptTokens += r.prompt_tokens;
    agg.completionTokens += r.completion_tokens;
    agg.cost += r.cost_usd;
    if (r.status === "error") agg.errorCount += 1;
    else agg.successCount += 1;
    agg.modelCounts.set(r.model, (agg.modelCounts.get(r.model) ?? 0) + 1);
    totalCost += r.cost_usd;

    if (r.prompt_hash) {
      let h = hashes.get(r.prompt_hash);
      if (!h) {
        h = {
          hash: r.prompt_hash,
          count: 0,
          promptTokens: 0,
          featureTag: tag,
          modelCounts: new Map(),
        };
        hashes.set(r.prompt_hash, h);
      }
      h.count += 1;
      h.promptTokens += r.prompt_tokens;
      h.modelCounts.set(r.model, (h.modelCounts.get(r.model) ?? 0) + 1);
    }
  }

  const out: Suggestion[] = [];

  for (const agg of tags.values()) {
    const avgPrompt = agg.count ? agg.promptTokens / agg.count : 0;
    const avgCompletion = agg.count ? agg.completionTokens / agg.count : 0;
    const monthlyCost = agg.cost;
    const model = dominantModel(agg.modelCounts);

    // --- Rule 1: Expensive model on low-token feature -----------------------
    if (avgPrompt < 500 && frontierShare(agg) > 0.5 && monthlyCost > 5) {
      out.push({
        id: `expensive-model-on-simple-tag:${agg.tag}`,
        severity: "high",
        category: "model",
        title: `Switch ${agg.tag} to a cheaper model`,
        description: `Your ${agg.tag} feature averages ${Math.round(avgPrompt)} tokens per call — too simple to need a frontier model. Routing it to GPT-4o-mini or Claude Haiku would cut this feature's cost by ~80%.`,
        impact_usd: round2(monthlyCost * 0.8),
        evidence: {
          feature_tag: agg.tag,
          avg_tokens: Math.round(avgPrompt),
          current_model: model,
          monthly_cost: round2(monthlyCost),
        },
        action: `Set a model override for "${agg.tag}" to gpt-4o-mini (OpenAI) or claude-3-5-haiku (Anthropic).`,
      });
    }

    // --- Rule 2: Ballooning completion tokens -------------------------------
    if (
      avgCompletion > avgPrompt * 2 &&
      agg.count > 20 &&
      monthlyCost > 3
    ) {
      let completionCost = 0;
      for (const r of agg.rows) {
        completionCost += r.completion_tokens * outputCostPerToken(r.model);
      }
      const ratio = avgPrompt > 0 ? avgCompletion / avgPrompt : 0;
      out.push({
        id: `ballooning-completion-tokens:${agg.tag}`,
        severity: "medium",
        category: "token-waste",
        title: `Cap max_tokens for ${agg.tag}`,
        description: `Your ${agg.tag} feature's responses average ${Math.round(avgCompletion)} completion tokens — ${ratio.toFixed(1)}x longer than the input. Setting a max_tokens limit would reduce cost without affecting most responses.`,
        impact_usd: round2(completionCost * 0.3),
        evidence: {
          feature_tag: agg.tag,
          avg_prompt_tokens: Math.round(avgPrompt),
          avg_completion_tokens: Math.round(avgCompletion),
          ratio: round2(ratio),
        },
        action: `Add x-promptlens-max-tokens (or a max_completion_tokens policy) for "${agg.tag}".`,
      });
    }

    // --- Rule 3: High error rate burning tokens (7d) ------------------------
    const rows7d = agg.rows.filter((r) => new Date(r.timestamp).getTime() >= cutoff7d);
    const errors7d = rows7d.filter((r) => r.status === "error").length;
    if (rows7d.length > 10 && errors7d / rows7d.length > 0.1) {
      const errorRate = errors7d / rows7d.length;
      const avgCostPerRequest = agg.successCount ? agg.cost / agg.successCount : 0;
      const wasted = errors7d * avgCostPerRequest * (30 / 7);
      out.push({
        id: `high-error-rate:${agg.tag}`,
        severity: "high",
        category: "token-waste",
        title: `Fix errors in ${agg.tag} — you're paying for failed calls`,
        description: `${Math.round(errorRate * 100)}% of your ${agg.tag} calls are failing, but you're still being charged for the prompt tokens sent. Fixing the underlying error would save approximately $${round2(wasted)}/month.`,
        impact_usd: round2(wasted),
        evidence: {
          feature_tag: agg.tag,
          error_rate: round2(errorRate),
          error_count: errors7d,
          wasted_cost_usd: round2(wasted),
        },
        action: `Inspect recent failing "${agg.tag}" requests and fix the root cause (bad params, rate limits, or auth).`,
      });
    }

    // --- Rule 4: Single feature dominating spend ----------------------------
    if (totalCost > 0 && monthlyCost / totalCost > 0.6) {
      const pct = (monthlyCost / totalCost) * 100;
      out.push({
        id: `feature-dominating-spend:${agg.tag}`,
        severity: "medium",
        category: "volume",
        title: `${agg.tag} is consuming ${Math.round(pct)}% of your budget`,
        description: `One feature is driving most of your LLM cost. Consider adding a spend cap or model override rule for ${agg.tag} in the Controls panel to protect your budget.`,
        impact_usd: 0,
        evidence: {
          feature_tag: agg.tag,
          pct_of_total: round2(pct),
          monthly_cost: round2(monthlyCost),
        },
        action: `Add a monthly_budget_usd policy for "${agg.tag}" in the Spend controls panel.`,
      });
    }

    // --- Rule 6: Low cache efficiency (bursts, 7d) --------------------------
    const burstTs = rows7d.map((r) => new Date(r.timestamp).getTime());
    const { bursts, maxCalls } = detectBursts(burstTs);
    if (bursts > BURST_MIN_OCCURRENCES) {
      let promptCost = 0;
      for (const r of agg.rows) {
        promptCost += r.prompt_tokens * inputCostPerToken(r.model);
      }
      out.push({
        id: `low-cache-efficiency:${agg.tag}`,
        severity: "low",
        category: "caching",
        title: `Enable prompt caching for ${agg.tag}`,
        description: `Your ${agg.tag} feature sends repeated bursts of similar requests. Adding Anthropic prompt caching or OpenAI cached inputs on your system prompt could cut costs by up to 90% on repeated calls.`,
        impact_usd: round2(promptCost * 0.5),
        evidence: {
          feature_tag: agg.tag,
          burst_count: bursts,
          calls_per_burst: maxCalls,
        },
        action: `Enable provider prompt caching (Anthropic cache_control / OpenAI cached inputs) on the "${agg.tag}" system prompt.`,
      });
    }
  }

  // --- Rule 5: Redundant prompt templates (high-volume long hash) -----------
  for (const h of hashes.values()) {
    const avgPrompt = h.count ? h.promptTokens / h.count : 0;
    if (h.count > 50 && avgPrompt > 800) {
      const model = dominantModel(h.modelCounts);
      const impact = h.count * avgPrompt * 0.3 * inputCostPerToken(model);
      out.push({
        id: `redundant-prompt-template:${h.hash.slice(0, 12)}`,
        severity: "medium",
        category: "token-waste",
        title: `Long system prompt used ${h.count} times — consider compression`,
        description: `One of your prompt templates (${h.hash.slice(0, 8)}...) is sent ${h.count} times/month with an average of ${Math.round(avgPrompt)} tokens. Compressing it by 30% would save approximately $${round2(impact)}/month.`,
        impact_usd: round2(impact),
        evidence: {
          prompt_hash_prefix: h.hash.slice(0, 12),
          call_count: h.count,
          avg_prompt_tokens: Math.round(avgPrompt),
          feature_tag: h.featureTag,
        },
        action: `Shorten this system prompt template, or click "Preview compression" to see an automated pass.`,
      });
    }
  }

  // --- Rule 7: Quick win (highest impact) ----------------------------------
  out.sort((a, b) => b.impact_usd - a.impact_usd);
  if (out.length > 0 && out[0].impact_usd > 0) {
    out[0].quick_win = true;
  }

  return out;
}

// ---------------------------------------------------------------------------
// GET /api/analysis/suggestions
// ---------------------------------------------------------------------------
analysisRouter.get("/suggestions", (req: Request, res: Response): void => {
  try {
    const since = new Date(Date.now() - WINDOW_30D_MS).toISOString();
    const rows = getRequestsForAnalysis(since, req.userId);
    res.json(buildSuggestions(rows));
  } catch (err) {
    console.error("[analysis/suggestions] failed:", err);
    res.status(500).json({ error: "Failed to analyze usage" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/analysis/prompt-lint
//   Pre-send prompt suggestions. Stateless; runs the rule engine in-process.
// ---------------------------------------------------------------------------
analysisRouter.post("/prompt-lint", (req: Request, res: Response): void => {
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt : "";
  res.json(lintPrompt(prompt));
});

// ---------------------------------------------------------------------------
// POST /api/analysis/compress
// ---------------------------------------------------------------------------
analysisRouter.post("/compress", (req: Request, res: Response): void => {
  const promptHash = typeof req.body?.prompt_hash === "string" ? req.body.prompt_hash : "";
  if (!promptHash) {
    res.status(400).json({ error: "prompt_hash required" });
    return;
  }

  // Prompt content is not persisted by default (only the SHA-256 hash). Without
  // STORE_PROMPTS=true and stored content there is nothing to compress.
  const stored = getStoredPromptContent(promptHash);
  if (process.env.STORE_PROMPTS !== "true" || stored === null) {
    res.status(404).json({
      error:
        "Prompt content not stored. Set STORE_PROMPTS=true in your proxy config to enable compression previews.",
    });
    return;
  }

  const result = compressSystemPrompt(stored);
  res.json(result);
});

/**
 * Placeholder lookup for stored prompt content. PromptLens does not persist
 * prompt content by default (privacy), so this always returns null until a
 * content store is wired up behind STORE_PROMPTS.
 */
function getStoredPromptContent(_promptHash: string): string | null {
  return null;
}
