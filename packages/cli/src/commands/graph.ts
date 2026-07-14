// `veyr graph` — Graphify graph status, reading ~/.veyr/cache/graph.json.
// Single global file: reflects whichever workspace the Mac app most recently
// built a graph for, not necessarily the CLI's current working directory.

import chalk from "chalk";
import { readGraphCache, topNodesByConnections } from "../veyr/graph.js";
import { fmtAge } from "../ui.js";

export async function graphCommand(opts: { json?: boolean; top?: string }): Promise<void> {
  const result = readGraphCache();

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
