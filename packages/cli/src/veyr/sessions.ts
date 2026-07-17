// Per-session spend data for `veyr usage` and the dashboard. Prefers the
// daemon's GET /sessions (the app's own SessionEntry rows, priced with its
// full pricing pipeline including the models.dev catalog); falls back to
// re-deriving sessions from ~/.veyr/cache/sessions.json — the scanner's raw
// per-row cache, which carries tokens but not costs — priced CLI-side via
// pricing.ts and tagged via tags.ts, mirroring VeyrSessionScanner.buildSessions.

import * as fs from "node:fs";
import * as path from "node:path";
import { daemonGet } from "./daemon.js";
import { sessionsCacheFilePath } from "./paths.js";
import { costUsd } from "./pricing.js";
import { loadTagInferrer } from "./tags.js";

export interface SessionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUSD: number;
}

export interface CliSessionEntry {
  /** Epoch ms of the most recent activity in the session. */
  readonly timestampMs: number;
  /** Epoch ms of the first activity in the session. */
  readonly startedAtMs: number;
  readonly provider: string;
  /** Most frequently used model in the session. */
  readonly modelId: string;
  readonly featureTag: string;
  readonly usage: SessionUsage;
  readonly projectPath?: string;
  readonly sessionId?: string;
  readonly entryCount: number;
}

export type SessionsResult =
  | { readonly kind: "daemon" | "cache"; readonly sessions: readonly CliSessionEntry[] }
  | { readonly kind: "missing" };

// ---------------------------------------------------------------------------
// Daemon path — SessionEntry as the app encodes it (camelCase, ISO dates)
// ---------------------------------------------------------------------------

interface DaemonSession {
  readonly timestamp: string;
  readonly startedAt: string;
  readonly provider: string;
  readonly modelId: string;
  readonly featureTag: string;
  readonly usage: SessionUsage;
  readonly projectPath?: string;
  readonly sessionId?: string;
  readonly entryCount: number;
}

function fromDaemon(payload: unknown): readonly CliSessionEntry[] | null {
  if (typeof payload !== "object" || payload === null) return null;
  const sessions = (payload as { sessions?: unknown }).sessions;
  if (!Array.isArray(sessions)) return null;
  const entries: CliSessionEntry[] = [];
  for (const raw of sessions as DaemonSession[]) {
    const timestampMs = Date.parse(raw.timestamp);
    const startedAtMs = Date.parse(raw.startedAt);
    if (Number.isNaN(timestampMs) || Number.isNaN(startedAtMs) || typeof raw.modelId !== "string") continue;
    entries.push({
      timestampMs,
      startedAtMs,
      provider: raw.provider ?? "claude",
      modelId: raw.modelId,
      featureTag: raw.featureTag ?? "untagged",
      usage: raw.usage,
      projectPath: raw.projectPath,
      sessionId: raw.sessionId,
      entryCount: raw.entryCount ?? 0,
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// File fallback — VeyrSessionScanner's row cache, priced CLI-side
// ---------------------------------------------------------------------------

interface CachedRow {
  readonly timestampMs: number;
  readonly model: string;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

interface CachedFile {
  readonly sessionId?: string;
  readonly cwd?: string;
  readonly rows?: readonly CachedRow[];
}

function fromCacheFile(): readonly CliSessionEntry[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(sessionsCacheFilePath(), "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const cache = parsed as { version?: number; files?: Record<string, CachedFile> };
  if (cache.version !== 1 || typeof cache.files !== "object" || cache.files === null) return null;

  const inferrer = loadTagInferrer();
  const sessions: CliSessionEntry[] = [];

  for (const [filePath, file] of Object.entries(cache.files)) {
    const rows = file.rows ?? [];
    if (rows.length === 0) continue;

    let inputTokens = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;
    let cost = 0;
    const modelCounts = new Map<string, number>();
    let minTs = Number.POSITIVE_INFINITY;
    let maxTs = Number.NEGATIVE_INFINITY;

    for (const row of rows) {
      inputTokens += Math.max(0, row.input);
      outputTokens += Math.max(0, row.output);
      cacheReadTokens += Math.max(0, row.cacheRead);
      cacheWriteTokens += Math.max(0, row.cacheWrite);
      cost += costUsd(row.model, row.input, row.output, row.cacheRead, row.cacheWrite, row.timestampMs);
      modelCounts.set(row.model, (modelCounts.get(row.model) ?? 0) + 1);
      minTs = Math.min(minTs, row.timestampMs);
      maxTs = Math.max(maxTs, row.timestampMs);
    }

    // Dominant model, ties broken by lexicographically smallest id (matches
    // the scanner's max-by-(count, key) comparator).
    const dominantModel =
      [...modelCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "unknown";

    sessions.push({
      timestampMs: maxTs,
      startedAtMs: minTs,
      provider: "claude",
      modelId: dominantModel,
      featureTag: inferrer.inferTag(file.cwd),
      usage: { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUSD: cost },
      projectPath: file.cwd,
      sessionId: file.sessionId ?? path.basename(filePath, path.extname(filePath)),
      entryCount: rows.length,
    });
  }

  return sessions.sort((a, b) => b.timestampMs - a.timestampMs);
}

/**
 * Daemon first (app-priced, fresh), sessions.json fallback (CLI-priced from
 * the built-in table — close but not guaranteed identical to the app's
 * models.dev-backed figures). "missing" means neither source exists, i.e.
 * the Mac app has never scanned any Claude Code logs on this machine.
 */
export async function readSessions(): Promise<SessionsResult> {
  const payload = await daemonGet<unknown>("/sessions", 2000);
  if (payload !== null) {
    const sessions = fromDaemon(payload);
    if (sessions !== null) return { kind: "daemon", sessions };
  }
  const sessions = fromCacheFile();
  if (sessions !== null) return { kind: "cache", sessions };
  return { kind: "missing" };
}

// ---------------------------------------------------------------------------
// Aggregations (mirroring VeyrSpendStore's, over a plain array)
// ---------------------------------------------------------------------------

export interface SpendBucket {
  costUSD: number;
  sessionCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

function emptyBucket(): SpendBucket {
  return { costUSD: 0, sessionCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
}

function fold(bucket: SpendBucket, session: CliSessionEntry): void {
  bucket.costUSD += session.usage.costUSD;
  bucket.sessionCount += 1;
  bucket.inputTokens += session.usage.inputTokens;
  bucket.outputTokens += session.usage.outputTokens;
  bucket.cacheReadTokens += session.usage.cacheReadTokens;
}

export function totalSince(
  sessions: readonly CliSessionEntry[],
  sinceMs: number
): SpendBucket {
  const bucket = emptyBucket();
  for (const session of sessions) {
    if (session.timestampMs >= sinceMs) fold(bucket, session);
  }
  return bucket;
}

export function groupBy(
  sessions: readonly CliSessionEntry[],
  sinceMs: number,
  keyOf: (session: CliSessionEntry) => string
): Array<{ key: string; bucket: SpendBucket }> {
  const buckets = new Map<string, SpendBucket>();
  for (const session of sessions) {
    if (session.timestampMs < sinceMs) continue;
    const key = keyOf(session);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = emptyBucket();
      buckets.set(key, bucket);
    }
    fold(bucket, session);
  }
  return [...buckets.entries()]
    .map(([key, bucket]) => ({ key, bucket }))
    .sort((a, b) => b.bucket.costUSD - a.bucket.costUSD);
}

export function startOfToday(now: Date = new Date()): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** Week starts on Sunday, matching Calendar.current's default in the app's locale. */
export function startOfWeek(now: Date = new Date()): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - day.getDay());
  return day.getTime();
}

export function startOfMonth(now: Date = new Date()): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  day.setDate(1);
  return day.getTime();
}

/** Last 7 calendar days (oldest first), zero-filled, for the spend bars.
 * Buckets by local calendar date (not fixed 24h spans) so DST days stay whole. */
export function last7Days(
  sessions: readonly CliSessionEntry[],
  now: Date = new Date()
): Array<{ dayStartMs: number; costUSD: number }> {
  const localDateKey = (ms: number): string => {
    const d = new Date(ms);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };
  const days: Array<{ dayStartMs: number; costUSD: number }> = [];
  const byKey = new Map<string, { dayStartMs: number; costUSD: number }>();
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const entry = { dayStartMs: day.getTime(), costUSD: 0 };
    days.push(entry);
    byKey.set(localDateKey(entry.dayStartMs), entry);
  }
  for (const session of sessions) {
    const entry = byKey.get(localDateKey(session.timestampMs));
    if (entry) entry.costUSD += session.usage.costUSD;
  }
  return days;
}
