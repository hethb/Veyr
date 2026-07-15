// Reader for ~/.veyr/cache/graph.json — the trimmed Graphify graph written by
// GraphifyRunner.writeGraphCache() (packages/desktop-mac/Sources/VeyrKit/Graphify/GraphifyRunner.swift).
// Unlike VEYR_STATUS.json, this encodes with plain camelCase keys (no
// snake_case conversion) and is a single global file — it reflects whichever
// workspace the Mac app most recently built a graph for, not the CLI's cwd.

import * as fs from "node:fs";
import { daemonGet, daemonPost, ensureDaemonRunning, type EnsureDaemonResult } from "./daemon.js";
import { graphCacheFilePath } from "./paths.js";

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly file: string;
  readonly line?: number;
  readonly community?: number;
  readonly inDegree: number;
  readonly outDegree: number;
}

export interface GraphLink {
  readonly source: string;
  readonly target: string;
  readonly relation: string;
}

export interface GraphCachePayload {
  readonly schemaVersion: number;
  readonly isPartial: boolean;
  readonly partialSubdirectory?: string;
  readonly workspaceRoot: string;
  readonly generatedAt: string;
  readonly graphifyVersion: string;
  readonly builtAtCommit?: string;
  readonly fileCount: number;
  readonly totalNodeCount: number;
  readonly totalLinkCount: number;
  readonly primaryLanguages: readonly string[];
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
}

export type GraphCacheResult =
  | { readonly kind: "ok"; readonly payload: GraphCachePayload; readonly generatedAt: Date }
  | { readonly kind: "missing" };

function isGraphCachePayload(value: unknown): value is GraphCachePayload {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record["workspaceRoot"] === "string" &&
    typeof record["generatedAt"] === "string" &&
    Array.isArray(record["nodes"])
  );
}

function resultFor(parsed: unknown): GraphCacheResult {
  if (!isGraphCachePayload(parsed)) return { kind: "missing" };
  const generatedAt = new Date(parsed.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) return { kind: "missing" };
  return { kind: "ok", payload: parsed, generatedAt };
}

function readGraphCacheFromFile(): GraphCacheResult {
  let raw: string;
  try {
    raw = fs.readFileSync(graphCacheFilePath(), "utf8");
  } catch {
    return { kind: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "missing" };
  }
  return resultFor(parsed);
}

/**
 * Prefers the live daemon (reflects the workspace the app is tracking right
 * now, including a build just kicked off by `--refresh`) but always falls
 * back to ~/.veyr/cache/graph.json when it isn't reachable.
 */
export async function readGraphCache(): Promise<GraphCacheResult> {
  const fromDaemon = await daemonGet<unknown>("/graph");
  if (fromDaemon !== null) {
    const result = resultFor(fromDaemon);
    if (result.kind !== "missing") return result;
  }
  return readGraphCacheFromFile();
}

/**
 * Triggers an on-demand Graphify rescan of `path` — live computation, so
 * unlike a plain read this needs the daemon and will launch the Veyr menu
 * bar app headlessly (no window, no Dock icon) if it isn't already running.
 * Returns immediately once the rescan has started; the build itself can take
 * anywhere from under a second to several minutes on a large repo, so the
 * caller is expected to poll `readGraphCache()` afterward.
 */
export async function requestGraphRefresh(path: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  const ensured: EnsureDaemonResult = await ensureDaemonRunning();
  if (!ensured.ok) return ensured;
  const response = await daemonPost<{ ok?: boolean }>(`/graph/refresh?path=${encodeURIComponent(path)}`, 5000);
  if (!response?.ok) {
    return { ok: false, reason: "Veyr is running but didn't accept the rescan request." };
  }
  return { ok: true };
}

/** Top-N nodes by total degree (in + out), descending. */
export function topNodesByConnections(
  payload: GraphCachePayload,
  limit: number
): ReadonlyArray<GraphNode & { readonly connections: number }> {
  return [...payload.nodes]
    .map((n) => ({ ...n, connections: n.inDegree + n.outDegree }))
    .sort((a, b) => b.connections - a.connections)
    .slice(0, limit);
}
