// Reader for ~/.veyr/cache/graph.json — the trimmed Graphify graph written by
// GraphifyRunner.writeGraphCache() (packages/desktop-mac/Sources/VeyrKit/Graphify/GraphifyRunner.swift).
// Unlike VEYR_STATUS.json, this encodes with plain camelCase keys (no
// snake_case conversion) and is a single global file — it reflects whichever
// workspace the Mac app most recently built a graph for, not the CLI's cwd.

import * as fs from "node:fs";
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

export function readGraphCache(): GraphCacheResult {
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
  if (!isGraphCachePayload(parsed)) return { kind: "missing" };
  const generatedAt = new Date(parsed.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) return { kind: "missing" };
  return { kind: "ok", payload: parsed, generatedAt };
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
