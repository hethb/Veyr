// Reader for ~/.veyr/cache/graph.json — the trimmed Graphify graph written by
// GraphifyRunner.writeGraphCache() (packages/desktop-mac/Sources/VeyrKit/Graphify/GraphifyRunner.swift).
// Unlike VEYR_STATUS.json, this encodes with plain camelCase keys (no
// snake_case conversion) and is a single global file — it reflects whichever
// workspace the Mac app most recently built a graph for, not the CLI's cwd.

import * as fs from "node:fs";
import { daemonGet, daemonPost } from "./daemon.js";
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

/** File-only read, bypassing the daemon — used right after a local build so
 * a running-but-unrefreshed daemon can't mask the newly written cache. */
export function readGraphCacheFromFile(): GraphCacheResult {
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
 * Asks a running daemon (i.e. the desktop app, when installed and open) to
 * rescan `path`. Returns false when no daemon is reachable or it declines —
 * the caller then runs the build itself via graphify.ts's buildGraphLocally,
 * so a CLI-only install never needs the app. Returns immediately once the
 * rescan has started; the build can take seconds to minutes on a large repo,
 * so the caller is expected to poll `readGraphCache()` afterward.
 */
export async function requestDaemonGraphRefresh(path: string): Promise<boolean> {
  if (!(await daemonGet("/health"))) return false;
  const response = await daemonPost<{ ok?: boolean }>(`/graph/refresh?path=${encodeURIComponent(path)}`, 5000);
  return response?.ok === true;
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
