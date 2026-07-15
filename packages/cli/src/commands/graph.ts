// `veyr graph` — Graphify graph status. Prefers the live daemon the menu bar
// app hosts while running, falling back to ~/.veyr/cache/graph.json — a
// single global file reflecting whichever workspace the app most recently
// built a graph for, not necessarily the CLI's current working directory.
// `--refresh` targets the CLI's cwd explicitly via the daemon.

import chalk from "chalk";
import { readGraphCache, requestGraphRefresh, topNodesByConnections, type GraphCacheResult } from "../veyr/graph.js";
import { fmtAge } from "../ui.js";

const REFRESH_POLL_INTERVAL_MS = 1000;
const REFRESH_POLL_TIMEOUT_MS = 5 * 60 * 1000;

async function waitForFreshGraph(startedAfter: Date): Promise<GraphCacheResult> {
  const deadline = Date.now() + REFRESH_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await readGraphCache();
    if (result.kind === "ok" && result.generatedAt > startedAfter) return result;
    await new Promise((resolve) => setTimeout(resolve, REFRESH_POLL_INTERVAL_MS));
  }
  return readGraphCache();
}

export async function graphCommand(opts: { json?: boolean; top?: string; refresh?: boolean }): Promise<void> {
  let result: GraphCacheResult;

  if (opts.refresh) {
    const startedAt = new Date();
    console.log(chalk.dim("requesting an on-demand rescan…"));
    const requested = await requestGraphRefresh(process.cwd());
    if (!requested.ok) {
      console.log(chalk.red(`✗ ${requested.reason}`));
      process.exitCode = 1;
      return;
    }
    console.log(chalk.dim("rescan started — this can take a few seconds to a few minutes on a large repo"));
    result = await waitForFreshGraph(startedAt);
    if (result.kind === "missing" || result.generatedAt <= startedAt) {
      console.log(chalk.yellow("still building — run `veyr graph` again shortly to check."));
      return;
    }
  } else {
    result = await readGraphCache();
  }

  if (opts.json) {
    console.log(JSON.stringify(result.kind === "missing" ? result : result.payload, null, 2));
    return;
  }

  if (result.kind === "missing") {
    console.log(chalk.dim("○ no graph yet — run the Veyr menu bar app in a workspace to build one"));
    return;
  }

  const { payload, generatedAt } = result;
  console.log(chalk.green("● built") + chalk.dim(` · ${fmtAge(generatedAt)}`));
  console.log();
  console.log(chalk.bold(payload.workspaceRoot));
  console.log(
    `  ${payload.isPartial ? "Partial graph" : "Full graph"}` +
      (payload.isPartial && payload.partialSubdirectory
        ? chalk.dim(` (scoped to ${payload.partialSubdirectory})`)
        : "")
  );
  console.log(
    `  ${payload.fileCount} files · ${payload.totalNodeCount} symbols · ${payload.totalLinkCount} links` +
      chalk.dim(
        payload.nodes.length < payload.totalNodeCount
          ? ` (cache ships top ${payload.nodes.length} nodes / ${payload.links.length} links)`
          : ""
      )
  );
  if (payload.primaryLanguages.length > 0) {
    console.log(`  Languages: ${payload.primaryLanguages.join(", ")}`);
  }
  console.log(
    chalk.dim(`  Graphify ${payload.graphifyVersion}` + (payload.builtAtCommit ? ` @ ${payload.builtAtCommit}` : ""))
  );

  const limit = Math.max(1, Number.parseInt(opts.top ?? "10", 10) || 10);
  const top = topNodesByConnections(payload, limit);
  if (top.length > 0) {
    console.log();
    console.log(chalk.bold(`Top ${top.length} by connections`));
    const width = Math.min(60, Math.max(...top.map((n) => n.label.length)));
    for (const node of top) {
      const label = node.label.length > width ? `${node.label.slice(0, width - 1)}…` : node.label.padEnd(width);
      console.log(`  ${label}  ${chalk.dim(node.file)}  ${node.connections}`);
    }
  }
}
