// Reader for ~/.veyr/agent-status/VEYR_STATUS.json — the same feed
// packages/vscode-extension/src/agentStatus.ts reads. Pure file access, no
// network. Whatever process is embedding VeyrKit (today, only the Veyr menu
// bar app) rewrites this file every 30s while a session is active, every 5
// minutes when idle.

import * as fs from "node:fs";
import { daemonGet } from "./daemon.js";
import { computeLocalStatus } from "./localStatus.js";
import { statusFilePath } from "./paths.js";

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

export interface VeyrAlert {
  readonly level: string; // "warning" | "critical"
  readonly message: string;
}

export interface VeyrRecommendation {
  readonly id: string;
  readonly priority: string; // "high" | "medium" | "low"
  readonly action: string; // "switch_model" | "compact_context" | ...
  readonly suggested_model?: string;
  readonly reason: string;
  readonly estimated_savings_per_hour_usd: number;
  readonly avg_output_tokens?: number;
}

export interface VeyrComplexityAnalysis {
  readonly classifier_enabled: boolean;
  readonly classified_turns_this_month: number;
  readonly simple_on_frontier_pct: number;
  readonly wasted_cost_this_month_usd: number;
}

export interface VeyrToolAnalysis {
  readonly tools_loaded: number;
  readonly tools_used: number;
  readonly unused_tool_token_estimate: number;
  readonly unused_tool_cost_this_session: number;
}

export interface VeyrFlaggedTool {
  readonly name: string;
  readonly issue: string;
  readonly suggestion: string;
}

export interface VeyrToolQuality {
  readonly analyzed: boolean;
  readonly total_tools: number;
  readonly flagged_tools: readonly VeyrFlaggedTool[];
}

export interface VeyrGraphActiveFile {
  readonly name: string;
  readonly file: string;
  readonly line?: number;
  readonly kind: string;
  readonly connections: number;
  readonly callers: readonly string[];
  readonly callees: readonly string[];
  readonly imports: readonly string[];
  readonly imported_by: readonly string[];
  readonly tests: readonly string[];
}

export interface VeyrGraphContext {
  readonly available: boolean;
  readonly is_partial: boolean;
  readonly partial_note?: string;
  readonly graphify_version: string;
  readonly file_count: number;
  readonly node_count: number;
  readonly edge_count: number;
  readonly last_built_at: string;
  readonly primary_languages: readonly string[];
  readonly architectural_overview: string;
  readonly active_file_summary?: VeyrGraphActiveFile;
  readonly critical_path: ReadonlyArray<{
    readonly name: string;
    readonly file: string;
    readonly connections: number;
  }>;
  readonly token_savings_estimate: {
    readonly without_graph: number;
    readonly with_graph: number;
    readonly savings_this_session: number;
    readonly savings_this_month: number;
  };
}

export interface VeyrStatus {
  readonly generated_at: string;
  readonly today_spent_usd?: number;
  readonly current_session?: VeyrCurrentSession;
  readonly budget: VeyrBudget;
  readonly alerts: readonly VeyrAlert[];
  readonly recommendations: readonly VeyrRecommendation[];
  readonly agent_instructions: string;
  readonly complexity?: VeyrComplexityAnalysis;
  readonly tool_analysis?: VeyrToolAnalysis;
  readonly tool_quality?: VeyrToolQuality;
  readonly graph_context?: VeyrGraphContext;
}

export type VeyrStatusResult =
  | { readonly kind: "ok"; readonly status: VeyrStatus; readonly generatedAt: Date }
  | { readonly kind: "stale"; readonly status: VeyrStatus; readonly generatedAt: Date }
  /** Computed by this CLI from local session logs — the desktop app has never
   * written a status feed on this machine. App-only sections are empty. */
  | { readonly kind: "local"; readonly status: VeyrStatus; readonly generatedAt: Date }
  | { readonly kind: "missing" };

// The Mac app rewrites the feed every 30s while a session is active but only
// every 5 minutes when idle — "stale" means older than the idle cadence, or
// this would read "inactive" for most of the gap between sessions. Matches
// packages/vscode-extension/src/agentStatus.ts's threshold exactly.
const STALE_AFTER_MS = 6 * 60 * 1000;

function isVeyrStatus(value: unknown): value is VeyrStatus {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["generated_at"] === "string" &&
    typeof record["agent_instructions"] === "string" &&
    Array.isArray(record["recommendations"])
  );
}

function resultFor(parsed: unknown, now: Date): VeyrStatusResult {
  if (!isVeyrStatus(parsed)) return { kind: "missing" };
  const generatedAt = new Date(parsed.generated_at);
  if (Number.isNaN(generatedAt.getTime())) return { kind: "missing" };
  const stale = now.getTime() - generatedAt.getTime() > STALE_AFTER_MS;
  return { kind: stale ? "stale" : "ok", status: parsed, generatedAt };
}

function readStatusFromFile(now: Date): VeyrStatusResult {
  let raw: string;
  try {
    raw = fs.readFileSync(statusFilePath(), "utf8");
  } catch {
    return { kind: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "missing" };
  }
  return resultFor(parsed, now);
}

/**
 * Prefers the live daemon (fresher than the ≤30s file cache, and works even
 * on the tick right before the file is rewritten) but never requires it —
 * the menu bar app not running is a normal state, not an error, so any
 * daemon failure (absent, unreachable, timed out) falls straight back to
 * VEYR_STATUS.json. When that file has never been written either (CLI-only
 * install, no desktop app), the CLI computes a snapshot from local session
 * logs itself; "missing" now means no logs exist on this machine at all.
 */
export async function readStatus(now: Date = new Date()): Promise<VeyrStatusResult> {
  const fromDaemon = await daemonGet<unknown>("/status");
  if (fromDaemon !== null) {
    const result = resultFor(fromDaemon, now);
    if (result.kind !== "missing") return result;
  }
  const fromFile = readStatusFromFile(now);
  if (fromFile.kind !== "missing") return fromFile;
  const local = await computeLocalStatus(now);
  if (local !== null) return { kind: "local", status: local, generatedAt: now };
  return { kind: "missing" };
}
