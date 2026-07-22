// Independent Codex CLI rollout-file scanner, writing per-session rows to
// ~/.veyr/cache/codex-sessions.json (see codexSessionsCacheFilePath()).
//
// Unlike claudeSessionScanner.ts, this has no per-session Swift precedent to
// port: Veyr's own VeyrSessionScanner.swift only ever covered Claude Code —
// Codex support anywhere in this codebase (Swift's CostUsageScanner+Codex*
// files) has only ever been aggregate day×model totals for the menu bar
// chart, never grouped per session. This module is new design work, built
// from:
//   - the rollout file format CostUsageScanner.swift's byte-level parser
//     decodes (line `type`s "session_meta" / "turn_context" / "event_msg",
//     the token_count payload shape, the root/env resolution) — proven
//     against real Codex CLI logs by CodexBar's userbase, even though the
//     per-session grouping built on top of those fields here is not,
//   - and Codex CLI's own documented rollout schema (openai/codex,
//     codex-rs/core/src/rollout.rs and the codex_rollout crate it wraps).
//
// Accepted simplifications, given there's no real local Codex history to
// verify against (see the codex-scanner discussion — verified with
// synthetic fixtures only):
//   - Session total = sum of each token_count event's `last_token_usage`
//     (the delta Codex reports for that turn), not reconciled against the
//     cumulative `total_token_usage` counter. Swift's scanner carries a lot
//     of machinery (codexShouldPreferTotalDelta, codexDivergentTotalDelta)
//     to handle that counter resetting across forked/compacted/resumed
//     sessions; this module doesn't detect or special-case forks/resumes at
//     all — a forked session's usage may be double-counted or attributed to
//     the wrong file until that's built out.
//   - `cwd` is read from session_meta.payload.cwd on a best-effort basis.
//     CostUsageScanner never extracts cwd for Codex at all (it doesn't need
//     to for day×model aggregates), so this field's presence/shape is
//     inferred from Codex's documented session_meta schema, not proven
//     against Swift or real data.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { codexSessionsCacheFilePath, expandTilde } from "./paths.js";

interface CodexRow {
  timestampMs: number;
  model?: string;
  input: number;
  output: number;
  cacheRead: number;
}

interface CodexCachedFile {
  mtimeMs: number;
  size: number;
  parsedBytes: number;
  sessionId?: string;
  cwd?: string;
  /** Model from the most recent turn_context seen, carried across incremental
   * scans so a token_count event with no turn_context in its own byte range
   * (because that turn_context was consumed by an earlier scan) still gets
   * attributed correctly. */
  lastModel?: string;
  rows: CodexRow[];
}

interface CodexCache {
  version: number;
  files: Record<string, CodexCachedFile>;
}

const MAX_LINE_BYTES = 512 * 1024;

/** Mirrors CostUsageScanner.defaultCodexSessionsRoot: $CODEX_HOME/sessions, else ~/.codex/sessions. */
export function defaultCodexSessionsRoots(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string[] {
  const codexHome = env.CODEX_HOME?.trim();
  const sessionsRoot = codexHome
    ? path.join(expandTilde(codexHome), "sessions")
    : path.join(home, ".codex", "sessions");
  // CostUsageScanner also scans a sibling "archived_sessions" directory when present.
  const archivedRoot = path.join(path.dirname(sessionsRoot), "archived_sessions");
  return [sessionsRoot, archivedRoot];
}

function loadCache(cacheFileURL: string): CodexCache {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFileURL, "utf8")) as Partial<CodexCache>;
    if (parsed.version === 1 && parsed.files && typeof parsed.files === "object") {
      return { version: 1, files: parsed.files };
    }
  } catch {
    // No cache yet, or unreadable — start fresh.
  }
  return { version: 1, files: {} };
}

function persistCache(cacheFileURL: string, cache: CodexCache): void {
  fs.mkdirSync(path.dirname(cacheFileURL), { recursive: true });
  const tmp = `${cacheFileURL}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cache));
  fs.renameSync(tmp, cacheFileURL);
}

function walkJsonlFiles(root: string): Array<{ filePath: string; mtimeMs: number; size: number }> {
  const results: Array<{ filePath: string; mtimeMs: number; size: number }> = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || !full.toLowerCase().endsWith(".jsonl")) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      if (stat.size > 0) {
        results.push({ filePath: full, mtimeMs: Math.floor(stat.mtimeMs), size: stat.size });
      }
    }
  }

  walk(root);
  return results;
}

function toInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function sessionIdFrom(obj: Record<string, unknown>, payload?: Record<string, unknown>): string | undefined {
  const candidates = [
    payload?.session_id,
    payload?.sessionId,
    payload?.id,
    obj.session_id,
    obj.sessionId,
    obj.id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

function modelFrom(payload: Record<string, unknown> | undefined): string | undefined {
  if (!payload) return undefined;
  const direct = payload.model ?? payload.model_name;
  if (typeof direct === "string") return direct;
  const info = payload.info as Record<string, unknown> | undefined;
  const nested = info?.model ?? info?.model_name;
  return typeof nested === "string" ? nested : undefined;
}

function usageFrom(info: Record<string, unknown> | undefined, key: string): CodexRow | undefined {
  const usage = info?.[key] as Record<string, unknown> | undefined;
  if (!usage) return undefined;
  return {
    timestampMs: 0, // filled in by the caller, which has the event's own timestamp
    input: Math.max(0, toInt(usage.input_tokens)),
    output: Math.max(0, toInt(usage.output_tokens)),
    cacheRead: Math.max(0, toInt(usage.cached_input_tokens ?? usage.cache_read_input_tokens)),
  };
}

function parseNewRows(
  filePath: string,
  startOffset: number,
  fileSize: number,
  initialModel: string | undefined
): { rows: CodexRow[]; parsedBytes: number; cwd?: string; sessionId?: string; lastModel?: string } {
  const rows: CodexRow[] = [];
  let cwd: string | undefined;
  let sessionId: string | undefined;
  let currentModel: string | undefined = initialModel;

  if (fileSize <= startOffset) {
    return { rows, parsedBytes: startOffset, lastModel: currentModel };
  }

  const fd = fs.openSync(filePath, "r");
  let buffer: Buffer;
  try {
    buffer = Buffer.alloc(fileSize - startOffset);
    fs.readSync(fd, buffer, 0, buffer.length, startOffset);
  } finally {
    fs.closeSync(fd);
  }

  const lastNewline = buffer.lastIndexOf(0x0a);
  if (lastNewline === -1) {
    return { rows, parsedBytes: startOffset, lastModel: currentModel };
  }

  const text = buffer.subarray(0, lastNewline + 1).toString("utf8");
  const parsedBytes = startOffset + Buffer.byteLength(text, "utf8");

  for (const line of text.split("\n")) {
    if (!line || line.length > MAX_LINE_BYTES) continue;
    if (!line.includes('"type"')) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = obj.type;
    const payload = obj.payload as Record<string, unknown> | undefined;

    if (type === "session_meta") {
      sessionId = sessionId ?? sessionIdFrom(obj, payload);
      const payloadCwd = payload?.cwd;
      if (typeof payloadCwd === "string" && payloadCwd.length > 0) cwd = payloadCwd;
      continue;
    }

    if (type === "turn_context") {
      currentModel = modelFrom(payload) ?? currentModel;
      continue;
    }

    if (type !== "event_msg" || !payload || payload.type !== "token_count") continue;

    const tsText = obj.timestamp;
    if (typeof tsText !== "string") continue;
    const timestampMs = Date.parse(tsText);
    if (Number.isNaN(timestampMs)) continue;

    const info = payload.info as Record<string, unknown> | undefined;
    const last = usageFrom(info, "last_token_usage");
    if (!last) continue;
    if (last.input === 0 && last.output === 0 && last.cacheRead === 0) continue;

    const model = modelFrom(info) ?? currentModel;
    rows.push({ timestampMs, model, input: last.input, output: last.output, cacheRead: last.cacheRead });
  }

  return { rows, parsedBytes, cwd, sessionId, lastModel: currentModel };
}

export interface CodexScanOptions {
  readonly cacheFileURL?: string;
  readonly sessionsRoots?: readonly string[];
}

export interface CodexScanSummary {
  readonly filesScanned: number;
  readonly filesTouched: number;
}

/**
 * Scans all Codex CLI rollout logs and persists per-file row caches to
 * ~/.veyr/cache/codex-sessions.json. One rollout file = one session,
 * mirroring Claude Code's file-per-conversation convention (and Codex's own
 * "sessions" directory naming) — Codex-specific fork/resume/compaction
 * semantics are not handled; see the module header.
 */
export function scanCodexSessions(options: CodexScanOptions = {}): CodexScanSummary {
  const cacheFileURL = options.cacheFileURL ?? codexSessionsCacheFilePath();
  const roots = options.sessionsRoots ?? defaultCodexSessionsRoots();
  const cache = loadCache(cacheFileURL);

  const touched = new Set<string>();
  let filesScanned = 0;

  for (const root of roots) {
    for (const { filePath, mtimeMs, size } of walkJsonlFiles(root)) {
      touched.add(filePath);
      const previous = cache.files[filePath];
      if (previous && previous.mtimeMs === mtimeMs && previous.size === size) continue;

      filesScanned += 1;
      const canIncremental = previous ? size > previous.size && previous.parsedBytes > 0 : false;
      const startOffset = canIncremental ? previous!.parsedBytes : 0;

      const initialModel = canIncremental ? previous?.lastModel : undefined;
      const {
        rows: newRows,
        parsedBytes,
        cwd,
        sessionId,
        lastModel,
      } = parseNewRows(filePath, startOffset, size, initialModel);
      const baseRows = canIncremental ? (previous?.rows ?? []) : [];

      cache.files[filePath] = {
        mtimeMs,
        size,
        parsedBytes,
        sessionId: sessionId ?? previous?.sessionId ?? path.basename(filePath, path.extname(filePath)),
        cwd: cwd ?? (canIncremental ? previous?.cwd : undefined),
        lastModel: lastModel ?? (canIncremental ? previous?.lastModel : undefined),
        rows: [...baseRows, ...newRows],
      };
    }
  }

  for (const filePath of Object.keys(cache.files)) {
    if (!touched.has(filePath)) delete cache.files[filePath];
  }

  persistCache(cacheFileURL, cache);
  return { filesScanned, filesTouched: touched.size };
}
