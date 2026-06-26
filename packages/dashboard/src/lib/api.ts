import { authEnabled, getAccessToken } from "./auth";

const baseUrl = (import.meta.env.VITE_PROXY_URL as string | undefined) ?? "http://localhost:3001";

// In local mode the proxy is single-tenant and unauthenticated. When auth is
// enabled we attach the Supabase access token so the proxy can scope data to
// the signed-in user.
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (authEnabled) {
    const token = await getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // ignore parse failure; keep default message
    }
    throw new Error(message);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverviewBucket {
  cost: number;
  requests: number;
  tokens: number;
}

export interface Overview {
  today: OverviewBucket;
  week: OverviewBucket;
  month: OverviewBucket;
}

export interface ByTagRow {
  feature_tag: string;
  cost: number;
  requests: number;
}

export interface TimeseriesPoint {
  date: string;
  cost: number;
  requests: number;
}

export interface TopTemplateRow {
  prompt_hash: string;
  total_cost: number;
  request_count: number;
  avg_tokens: number;
  feature_tag: string | null;
}

export interface CacheFeatureRow {
  feature_tag: string;
  prompt_tokens: number;
  cached_tokens: number;
  cache_creation_tokens: number;
  hit_rate: number;
  savings_usd: number;
  write_premium_usd: number;
  net_savings_usd: number;
}

export interface CacheTimePoint {
  date: string;
  cached_tokens: number;
  prompt_tokens: number;
  savings_usd: number;
}

export interface CacheStats {
  period: Period;
  /** Overall cache hit rate across all logged input tokens (0..1). */
  hit_rate: number;
  /** Total prompt tokens served from a provider cache HIT. */
  cached_tokens: number;
  /** Total prompt tokens WRITTEN to a provider cache. */
  cache_creation_tokens: number;
  /** Prompt tokens that paid full input price (regular = total - cached - creation). */
  regular_input_tokens: number;
  /** Sum of prompt_tokens across the period. */
  total_prompt_tokens: number;
  /** Gross USD saved by cache reads (before write premium). */
  savings_usd: number;
  /** Extra USD paid for cache writes vs. regular input. */
  write_premium_usd: number;
  /** Net USD saved (savings - write_premium). */
  net_savings_usd: number;
  /** What the input bill would have been at FULL price (no caching). */
  baseline_input_cost_usd: number;
  /** Requests that touched the cache (read or write). */
  cache_using_requests: number;
  /** Total requests in the window. */
  total_requests: number;
  by_feature: CacheFeatureRow[];
  timeseries: CacheTimePoint[];
}

export interface ApiKey {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface CreatedApiKey extends ApiKey {
  /** The full secret. Returned once on create; never persisted in plaintext. */
  key: string;
}

export type Period = "1d" | "7d" | "30d";

export type SuggestionSeverity = "high" | "medium" | "low";
export type SuggestionCategory =
  | "model"
  | "token-waste"
  | "session"
  | "caching"
  | "volume";

export interface Suggestion {
  id: string;
  severity: SuggestionSeverity;
  category: SuggestionCategory;
  title: string;
  description: string;
  impact_usd: number;
  evidence: Record<string, unknown>;
  action: string;
  quick_win?: boolean;
}

export interface CompressionPreview {
  original_tokens: number;
  compressed_tokens: number;
  pct_reduction: number;
  compressed_prompt: string;
}

export type PromptSeverity = "high" | "medium" | "low";

export interface PromptSuggestion {
  id: string;
  severity: PromptSeverity;
  title: string;
  detail: string;
}

export interface PromptLintResult {
  token_estimate: number;
  suggestions: PromptSuggestion[];
  improved_template: string;
}

export interface Exemplar {
  similarity: number;
  draft_preview: string;
  final_preview: string;
}

/** Superset of PromptLintResult returned by /personalized-suggest. */
export interface PersonalizedSuggestResult extends PromptLintResult {
  personalized: boolean;
  source: "rules" | "retrieval";
  exemplars: Exemplar[];
  rewrite: string | null;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export async function getOverview(): Promise<Overview> {
  const res = await authedFetch("/api/stats/overview");
  return (await res.json()) as Overview;
}

export async function getByTag(period: Period): Promise<ByTagRow[]> {
  const res = await authedFetch(`/api/stats/by-tag?period=${period}`);
  return (await res.json()) as ByTagRow[];
}

export async function getTimeseries(
  period: Period,
  granularity: "day" | "hour" = "day"
): Promise<TimeseriesPoint[]> {
  const res = await authedFetch(
    `/api/stats/timeseries?period=${period}&granularity=${granularity}`
  );
  return (await res.json()) as TimeseriesPoint[];
}

export async function getTopTemplates(limit = 10): Promise<TopTemplateRow[]> {
  const res = await authedFetch(`/api/stats/top-templates?limit=${limit}`);
  return (await res.json()) as TopTemplateRow[];
}

export async function getCacheStats(period: Period = "30d"): Promise<CacheStats> {
  const res = await authedFetch(`/api/stats/cache?period=${period}`);
  return (await res.json()) as CacheStats;
}

export async function listKeys(): Promise<ApiKey[]> {
  const res = await authedFetch("/api/keys");
  return (await res.json()) as ApiKey[];
}

export async function createKey(name: string): Promise<CreatedApiKey> {
  const res = await authedFetch("/api/keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return (await res.json()) as CreatedApiKey;
}

export async function deleteKey(id: string): Promise<void> {
  await authedFetch(`/api/keys/${id}`, { method: "DELETE" });
}

export async function getSuggestions(): Promise<Suggestion[]> {
  const res = await authedFetch("/api/analysis/suggestions");
  return (await res.json()) as Suggestion[];
}

export async function previewCompression(
  promptHash: string
): Promise<CompressionPreview> {
  const res = await authedFetch("/api/analysis/compress", {
    method: "POST",
    body: JSON.stringify({ prompt_hash: promptHash }),
  });
  return (await res.json()) as CompressionPreview;
}

export async function lintPrompt(prompt: string): Promise<PromptLintResult> {
  const res = await authedFetch("/api/analysis/prompt-lint", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
  return (await res.json()) as PromptLintResult;
}

/**
 * Phase-2-ready suggestion call. Returns the rule-based lint today (with
 * personalized:false); Phase 2 enriches it with retrieval + a rewrite without a
 * shape change, so the UI upgrades for free.
 */
export async function personalizedSuggest(
  prompt: string
): Promise<PersonalizedSuggestResult> {
  const res = await authedFetch("/api/analysis/personalized-suggest", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
  return (await res.json()) as PersonalizedSuggestResult;
}

/** Records whether the user accepted or dismissed a suggestion (the ML label). */
export async function recordSuggestionEvent(input: {
  suggestion_id: string;
  action: "accepted" | "dismissed";
  prompt?: string;
  surface?: string;
}): Promise<void> {
  try {
    await authedFetch("/api/analysis/suggestion-event", {
      method: "POST",
      body: JSON.stringify({ surface: "dashboard", ...input }),
    });
  } catch {
    // Telemetry is best-effort — never block the UI on it.
  }
}

/** Records a (draft -> final) rewrite pair. Raw text persists only under STORE_PROMPTS. */
export async function recordPromptRevision(input: {
  draft_prompt: string;
  final_prompt: string;
  accepted_suggestion_ids: string[];
}): Promise<{ stored: boolean }> {
  try {
    const res = await authedFetch("/api/analysis/prompt-revision", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return (await res.json()) as { stored: boolean };
  } catch {
    return { stored: false };
  }
}

// ---------------------------------------------------------------------------
// Document → Markdown
// ---------------------------------------------------------------------------

export interface ConvertResult {
  format: string;
  notes: string[];
  markdown: string;
  original_bytes: number;
  original_tokens: number;
  markdown_chars: number;
  markdown_tokens: number;
  tokens_saved: number;
  savings_pct: number;
  cost_saved_per_call_usd: Record<string, number>;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export async function convertDocument(file: File): Promise<ConvertResult> {
  const dataB64 = await fileToBase64(file);
  const res = await authedFetch("/api/convert", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      mime: file.type || null,
      data_b64: dataB64,
    }),
  });
  return (await res.json()) as ConvertResult;
}
