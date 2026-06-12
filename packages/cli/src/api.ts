// HTTP layer for the Canopy CLI: typed fetch helpers against the proxy,
// with the user-facing error handling every command shares.

import chalk from "chalk";
import fetch, { type Response as FetchResponse } from "node-fetch";
import { loadConfig } from "./config.js";

export class CliError extends Error {}
/** 401/403 from the proxy — distinct from "proxy is down". */
export class AuthError extends CliError {}

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

export interface TagStat {
  feature_tag: string;
  cost: number;
  requests: number;
}

export interface Suggestion {
  severity: "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  impact_usd: number;
  evidence: Record<string, unknown>;
  action: string;
  quick_win?: boolean;
}

export interface ApiKeyRow {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
}

export interface FeaturePolicy {
  id: string;
  api_key_id: string;
  feature_tag: string;
  monthly_budget_usd: number | null;
  max_completion_tokens: number | null;
  compress_prompts: boolean;
  fallback_model: string | null;
  rate_limit_per_minute: number | null;
  enable_prompt_caching: boolean;
}

export interface RecentRequest {
  id: string;
  timestamp: string;
  model: string;
  feature_tag: string | null;
  total_tokens: number;
  cost_usd: number;
}

export function proxyUrl(): string {
  return loadConfig().proxyUrl.replace(/\/+$/, "");
}

function connectionError(): CliError {
  return new CliError(
    chalk.red(`✗ Cannot connect to Canopy proxy at ${proxyUrl()}`) +
      "\n  Start the proxy with: npm run dev:proxy" +
      "\n  Or open the Canopy desktop app"
  );
}

function authError(): AuthError {
  return new AuthError(chalk.red("✗ Invalid API key.") + " Run: canopy config");
}

/** Unauthenticated liveness probe — /health is public on every proxy. */
export async function isProxyHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${proxyUrl()}/health`);
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body?.status === "ok";
  } catch {
    return false;
  }
}

async function request(path: string, init?: Parameters<typeof fetch>[1]): Promise<FetchResponse> {
  let res: FetchResponse;
  try {
    res = await fetch(`${proxyUrl()}${path}`, init);
  } catch {
    throw connectionError();
  }
  if (res.status === 401 || res.status === 403) throw authError();
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = ` — ${body.error}`;
    } catch {
      // non-JSON error body; status code alone will have to do
    }
    throw new CliError(chalk.red(`✗ Proxy returned ${res.status} for ${path}${detail}`));
  }
  return res;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await request(path);
  return (await res.json()) as T;
}

export async function apiSend<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
  const res = await request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/**
 * Policies are keyed by api_key_id. Resolve ours: prefer the key from config
 * (matched by its stored prefix), else the oldest key — which is also what
 * anonymous proxy traffic is attributed to.
 */
export async function resolveApiKeyId(): Promise<string> {
  const keys = await apiGet<ApiKeyRow[]>("/api/keys");
  if (keys.length === 0) {
    throw new CliError(
      chalk.red("✗ No API keys exist on this proxy yet.") +
        "\n  Open the dashboard (canopy open) and create one, or run the desktop app."
    );
  }
  const configured = loadConfig().apiKey;
  if (configured) {
    const match = keys.find((k) => configured.startsWith(k.key_prefix));
    if (match) return match.id;
  }
  const oldest = [...keys].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
  return oldest.id;
}

/** Top-level runner: prints friendly errors and exits non-zero. */
export async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof CliError) {
      console.error(err.message);
    } else {
      console.error(chalk.red("✗ Unexpected error:"), err);
    }
    process.exitCode = 1;
  }
}
