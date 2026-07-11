import { Router, type Request, type Response } from "express";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Serves the Graphify-derived codebase graph to the dashboard.
 *
 * Data source is the Mac app, which writes a *trimmed* graph (top structural
 * nodes with precomputed degrees/kinds — raw Graphify output is far too large
 * to ship) to ~/.veyr/cache/graph.json, plus the graph_context summary inside
 * VEYR_STATUS.json. This proxy only reads/relays local files; no graph data
 * leaves the machine.
 */
export const graphRouter: Router = Router();

const graphCachePath = () => path.join(os.homedir(), ".veyr", "cache", "graph.json");
const statusPath = () =>
  path.join(os.homedir(), ".veyr", "agent-status", "VEYR_STATUS.json");
const focusPath = () => path.join(os.homedir(), ".veyr", "cache", "graph-focus.json");

interface TrimmedGraphFile {
  schemaVersion: number;
  isPartial: boolean;
  partialSubdirectory: string | null;
  workspaceRoot: string;
  generatedAt: string;
  graphifyVersion: string;
  builtAtCommit: string | null;
  fileCount: number;
  totalNodeCount: number;
  totalLinkCount: number;
  primaryLanguages: string[];
  nodes: unknown[];
  links: unknown[];
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

graphRouter.get("/current", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [graph, status] = await Promise.all([
      readJson<TrimmedGraphFile>(graphCachePath()),
      readJson<Record<string, unknown>>(statusPath()),
    ]);

    if (!graph) {
      res.json({ available: false, reason: "graph_not_built" });
      return;
    }

    res.json({
      available: true,
      isPartial: graph.isPartial ?? false,
      partialSubdirectory: graph.partialSubdirectory ?? null,
      workspaceRoot: graph.workspaceRoot,
      generatedAt: graph.generatedAt,
      graphifyVersion: graph.graphifyVersion,
      builtAtCommit: graph.builtAtCommit ?? null,
      fileCount: graph.fileCount,
      totalNodeCount: graph.totalNodeCount,
      totalLinkCount: graph.totalLinkCount,
      primaryLanguages: graph.primaryLanguages ?? [],
      nodes: graph.nodes,
      links: graph.links,
      // VEYR_STATUS.json is the agents' snake_case contract.
      summary: status?.graph_context ?? null,
      recommendations: Array.isArray(status?.recommendations)
        ? (status.recommendations as Array<{ id?: string }>).filter((r) =>
            typeof r.id === "string" && r.id.startsWith("g")
          )
        : [],
    });
  } catch {
    res.status(500).json({ available: false, reason: "read_error" });
  }
});

/**
 * "Set as focus" from the node detail panel. The Mac app reads this file on its
 * next status tick and treats the node as the active focus for graphContext /
 * CLAUDE.md injection (override expires after 30 minutes on the app side).
 */
graphRouter.post("/focus", async (req: Request, res: Response): Promise<void> => {
  const { file, line } = (req.body ?? {}) as { file?: unknown; line?: unknown };
  if (typeof file !== "string" || file.length === 0) {
    res.status(400).json({ error: "file is required" });
    return;
  }
  try {
    await fs.mkdir(path.dirname(focusPath()), { recursive: true });
    await fs.writeFile(
      focusPath(),
      JSON.stringify(
        {
          file,
          line: typeof line === "number" ? line : null,
          // Second precision: Swift's .iso8601 JSONDecoder rejects fractional
          // seconds, and the Mac app is the consumer.
          setAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        },
        null,
        2
      )
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "write_failed" });
  }
});
