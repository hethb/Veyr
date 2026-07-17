// Independent Claude Code JSONL scanner — writes the same
// ~/.veyr/cache/sessions.json shape packages/desktop-mac/Sources/VeyrKit/Costs/VeyrSessionScanner.swift
// produces, so sessions.ts's existing fromCacheFile() reader needs no
// changes. This exists so platforms without the Swift app (Windows) can
// populate that cache themselves instead of depending on the Mac app having
// scanned at least once.
//
// Ports VeyrSessionScanner's scan/parseFile/mergeRows algorithm line-for-line
// where it matters for correctness (root resolution, per-line filtering,
// incremental byte offsets, streaming-chunk dedup). One accepted
// simplification: Swift's CostUsagePricing.normalizeClaudeModel handles
// Bedrock/Vertex-style model ids (regional prefixes, "-vN:M" suffixes) before
// storing the model string; this scanner stores the raw `message.model`
// value as-is. costUsd()'s own baseKeyFor()/lookupClaude() already strip a
// trailing "-YYYYMMDD" date suffix for pricing, which covers the direct
// Anthropic-API path Claude Code normally uses — only Bedrock/Vertex
// deployments would see a cosmetically undernormalized dominant-model label.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { expandTilde, sessionsCacheFilePath } from "./paths.js";

interface CachedRow {
  key?: string;
  timestampMs: number;
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  isSidechain?: boolean;
}

interface CachedFile {
  mtimeMs: number;
  size: number;
  parsedBytes: number;
  sessionId?: string;
  cwd?: string;
  rows: CachedRow[];
}

interface Cache {
  version: number;
  files: Record<string, CachedFile>;
}

const MAX_LINE_BYTES = 512 * 1024;

/** Mirrors VeyrSessionScanner.defaultProjectsRoots. */
export function defaultProjectsRoots(
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string[] {
  const envDirs = env.CLAUDE_CONFIG_DIR?.trim();
  if (envDirs) {
    return envDirs
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((raw) => {
        const expanded = expandTilde(raw);
        return path.basename(expanded) === "projects" ? expanded : path.join(expanded, "projects");
      });
  }
  return [path.join(home, ".config", "claude", "projects"), path.join(home, ".claude", "projects")];
}

function loadCache(cacheFileURL: string): Cache {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFileURL, "utf8")) as Partial<Cache>;
    if (parsed.version === 1 && parsed.files && typeof parsed.files === "object") {
      return { version: 1, files: parsed.files };
    }
  } catch {
    // No cache yet, or unreadable — start fresh, matching Swift's silent fallback.
  }
  return { version: 1, files: {} };
}

function persistCache(cacheFileURL: string, cache: Cache): void {
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

function toBool(value: unknown): boolean {
  return value === true;
}

/**
 * Parses new bytes appended to `filePath` since `startOffset`, returning the
 * new rows and how many bytes were fully consumed (always ending on a
 * newline boundary — a still-being-written trailing partial line is left for
 * the next scan, matching CostUsageJsonl's line-safety contract).
 */
function parseNewRows(
  filePath: string,
  startOffset: number,
  fileSize: number
): { rows: CachedRow[]; parsedBytes: number; cwd?: string; sessionId?: string } {
  const rows: CachedRow[] = [];
  let cwd: string | undefined;
  let sessionId: string | undefined;

  if (fileSize <= startOffset) {
    return { rows, parsedBytes: startOffset };
  }

  const fd = fs.openSync(filePath, "r");
  let buffer: Buffer;
  try {
    buffer = Buffer.alloc(fileSize - startOffset);
    fs.readSync(fd, buffer, 0, buffer.length, startOffset);
  } finally {
    fs.closeSync(fd);
  }

  const lastNewline = buffer.lastIndexOf(0x0a); // '\n'
  if (lastNewline === -1) {
    // No complete line yet in the new bytes — nothing to parse this pass.
    return { rows, parsedBytes: startOffset };
  }

  const text = buffer.subarray(0, lastNewline + 1).toString("utf8");
  const parsedBytes = startOffset + Buffer.byteLength(text, "utf8");

  for (const line of text.split("\n")) {
    if (!line || line.length > MAX_LINE_BYTES) continue;
    if (!line.includes('"type":"assistant"') || !line.includes('"usage"')) continue;

    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (obj.type !== "assistant") continue;

    const message = obj.message as Record<string, unknown> | undefined;
    const model = message?.model;
    const usage = message?.usage as Record<string, unknown> | undefined;
    const tsText = obj.timestamp;
    if (typeof model !== "string" || !usage || typeof tsText !== "string") continue;

    const timestampMs = Date.parse(tsText);
    if (Number.isNaN(timestampMs)) continue;

    const input = Math.max(0, toInt(usage.input_tokens));
    const cacheWrite = Math.max(0, toInt(usage.cache_creation_input_tokens));
    const cacheRead = Math.max(0, toInt(usage.cache_read_input_tokens));
    const output = Math.max(0, toInt(usage.output_tokens));
    if (input === 0 && cacheWrite === 0 && cacheRead === 0 && output === 0) continue;

    const lineCwd = obj.cwd;
    if (typeof lineCwd === "string" && lineCwd.length > 0) cwd = lineCwd;
    if (sessionId === undefined) {
      const sid = obj.sessionId ?? obj.session_id;
      if (typeof sid === "string") sessionId = sid;
    }

    const messageId = message?.id;
    const requestId = obj.requestId;
    const key =
      typeof messageId === "string" && typeof requestId === "string"
        ? `${messageId}:${requestId}`
        : undefined;

    rows.push({
      key,
      timestampMs,
      model,
      input,
      output,
      cacheRead,
      cacheWrite,
      isSidechain: toBool(obj.isSidechain),
    });
  }

  return { rows, parsedBytes, cwd, sessionId };
}

/** Mirrors VeyrSessionScanner.mergeRows: keyed rows last-write-wins, unkeyed rows always kept. */
function mergeRows(existing: CachedRow[], delta: CachedRow[]): CachedRow[] {
  const keyed = new Map<string, CachedRow>();
  const unkeyed: CachedRow[] = [];
  for (const row of [...existing, ...delta]) {
    if (row.key) keyed.set(row.key, row);
    else unkeyed.push(row);
  }
  const sortedKeys = [...keyed.keys()].sort();
  return [...sortedKeys.map((k) => keyed.get(k)!), ...unkeyed];
}

export interface ScanOptions {
  readonly cacheFileURL?: string;
  readonly projectsRoots?: readonly string[];
}

export interface ScanSummary {
  readonly filesScanned: number;
  readonly filesTouched: number;
}

/**
 * Scans all Claude Code project logs and persists per-file row caches to
 * ~/.veyr/cache/sessions.json (or `cacheFileURL` when overridden for tests).
 * Call sessions.ts's readSessions()/fromCacheFile() afterwards to turn this
 * into priced, tagged CliSessionEntry rows — this module only owns getting
 * raw usage rows out of the JSONL files and into that shared cache format.
 */
export function scanClaudeSessions(options: ScanOptions = {}): ScanSummary {
  const cacheFileURL = options.cacheFileURL ?? sessionsCacheFilePath();
  const roots = options.projectsRoots ?? defaultProjectsRoots();
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

      const { rows: newRows, parsedBytes, cwd, sessionId } = parseNewRows(filePath, startOffset, size);
      const baseRows = canIncremental ? (previous?.rows ?? []) : [];

      cache.files[filePath] = {
        mtimeMs,
        size,
        parsedBytes,
        sessionId: sessionId ?? previous?.sessionId ?? path.basename(filePath, path.extname(filePath)),
        cwd: cwd ?? (canIncremental ? previous?.cwd : undefined),
        rows: mergeRows(baseRows, newRows),
      };
    }
  }

  for (const filePath of Object.keys(cache.files)) {
    if (!touched.has(filePath)) delete cache.files[filePath];
  }

  persistCache(cacheFileURL, cache);
  return { filesScanned, filesTouched: touched.size };
}
