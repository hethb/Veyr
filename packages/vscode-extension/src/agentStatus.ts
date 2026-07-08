// Reader for the Veyr native app's agent feed (~/.veyr/agent-status/VEYR_STATUS.json).
// Pure file access — no network. The Mac app rewrites the file every 30s while a
// session is active.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";

export interface VeyrCurrentSession {
  readonly provider: string;
  readonly model: string;
  readonly project: string;
  readonly session_cost_usd: number;
  readonly input_tokens: number;
  readonly output_tokens: number;
  readonly cache_read_tokens: number;
  readonly cache_hit_rate: number;
  readonly session_duration_minutes: number;
  readonly cost_per_minute: number;
  readonly is_active: boolean;
}

export interface VeyrBudget {
  readonly project_monthly_cap_usd?: number;
  readonly project_spent_this_month_usd: number;
  readonly project_remaining_usd?: number;
  readonly project_pct_used?: number;
  readonly global_monthly_cap_usd?: number;
  readonly global_spent_this_month_usd: number;
  readonly global_remaining_usd?: number;
  readonly global_pct_used?: number;
}

export interface VeyrRecommendation {
  readonly id: string;
  readonly priority: string;
  readonly action: string;
  readonly suggested_model?: string;
  readonly reason: string;
  readonly estimated_savings_per_hour_usd: number;
}

export interface VeyrAlert {
  readonly level: string;
  readonly message: string;
}

export interface VeyrStatus {
  readonly generated_at: string;
  readonly today_spent_usd?: number;
  readonly current_session?: VeyrCurrentSession;
  readonly budget: VeyrBudget;
  readonly alerts: readonly VeyrAlert[];
  readonly recommendations: readonly VeyrRecommendation[];
  readonly agent_instructions: string;
}

export type VeyrStatusResult =
  | { readonly kind: "ok"; readonly status: VeyrStatus; readonly generatedAt: Date }
  | { readonly kind: "stale"; readonly status: VeyrStatus; readonly generatedAt: Date }
  | { readonly kind: "missing" };

// The Mac app rewrites the feed every 30s while a session is active but only
// every 5 minutes when idle — so "stale" must mean older than the idle
// cadence, or the bar reads "inactive" most of the time between sessions.
const STALE_AFTER_MS = 6 * 60 * 1000;

export function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function statusFilePath(): string {
  const configured = vscode.workspace
    .getConfiguration("veyr")
    .get<string>("agentStatusPath", "~/.veyr/agent-status/VEYR_STATUS.json");
  return expandTilde(configured);
}

function isVeyrStatus(value: unknown): value is VeyrStatus {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["generated_at"] === "string" &&
    typeof record["agent_instructions"] === "string" &&
    Array.isArray(record["recommendations"])
  );
}

export function readStatus(now: Date = new Date()): VeyrStatusResult {
  const file = statusFilePath();
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { kind: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "missing" };
  }
  if (!isVeyrStatus(parsed)) return { kind: "missing" };

  const generatedAt = new Date(parsed.generated_at);
  if (Number.isNaN(generatedAt.getTime())) return { kind: "missing" };
  const stale = now.getTime() - generatedAt.getTime() > STALE_AFTER_MS;
  return { kind: stale ? "stale" : "ok", status: parsed, generatedAt };
}

export function pollIntervalMs(): number {
  const seconds = vscode.workspace
    .getConfiguration("veyr")
    .get<number>("pollIntervalSeconds", 10);
  return Math.max(2, seconds) * 1000;
}

// --- Shared Veyr config file (~/.veyr/config.json) --------------------------
// Source of truth for the CLAUDE.md auto-injection toggle, shared with the
// native Mac app so either surface can flip it.

export function veyrConfigPath(): string {
  return path.join(os.homedir(), ".veyr", "config.json");
}

export function writeAutoInjectClaudeMd(enabled: boolean): void {
  const file = veyrConfigPath();
  let config: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null) {
      config = parsed as Record<string, unknown>;
    }
  } catch {
    // Missing or invalid file — start fresh.
  }
  config["autoUpdateClaudeMd"] = enabled;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

// --- Proxy optimization stats (for the "N% saved" status-bar suffix) --------

export function proxyBaseUrl(): string {
  return vscode.workspace
    .getConfiguration("veyr")
    .get<string>("proxyUrl", "http://localhost:3001")
    .replace(/\/$/, "");
}

/** Today's average compression ratio from the local proxy, or null when the
 *  proxy is unreachable or nothing was optimized today. Never throws. */
export async function fetchTodaySavingsPct(): Promise<number | null> {
  try {
    const res = await fetch(`${proxyBaseUrl()}/api/stats/optimization?period=1d`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { compression_ratio_pct?: number };
    const pct = data.compression_ratio_pct;
    return typeof pct === "number" && pct > 0 ? pct : null;
  } catch {
    return null;
  }
}

// --- Formatting helpers ------------------------------------------------------

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

export function commandFor(recommendation: VeyrRecommendation): string | undefined {
  switch (recommendation.action) {
    case "switch_model":
      return recommendation.suggested_model ? `/model ${recommendation.suggested_model}` : undefined;
    case "compact_context":
      return "/compact";
    default:
      return undefined;
  }
}
