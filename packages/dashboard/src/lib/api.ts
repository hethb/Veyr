const baseUrl = (import.meta.env.VITE_PROXY_URL as string | undefined) ?? "http://localhost:3001";

// Local mode: the proxy is single-tenant and unauthenticated, so we just hit
// the /api routes directly. (Swap in a real auth header here when adding
// multi-user support.)
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
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
