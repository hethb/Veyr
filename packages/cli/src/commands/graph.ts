// `veyr graph` — Graphify graph status. Prefers the live daemon the desktop
// app hosts while running, falling back to ~/.veyr/cache/graph.json — a
// single global file reflecting whichever workspace was most recently
// built, not necessarily the CLI's current working directory. `--refresh`
// targets the CLI's cwd explicitly: via the daemon when the app is running,
// otherwise by running Graphify directly (graphify.ts) — no app required.

import chalk from "chalk";
import {
  readGraphCache,
  readGraphCacheFromFile,
  requestDaemonGraphRefresh,
  topNodesByConnections,
  type GraphCacheResult,
} from "@veyr/core";
import { buildGraphLocally } from "@veyr/core";
import { readStatus } from "@veyr/core";
import { fmtAge, fmtTokens } from "../ui.js";

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
    if (await requestDaemonGraphRefresh(process.cwd())) {
      console.log(chalk.dim("rescan started via the Veyr app — this can take a few seconds to a few minutes on a large repo"));
      result = await waitForFreshGraph(startedAt);
      if (result.kind === "missing" || result.generatedAt <= startedAt) {
        console.log(chalk.yellow("still building — run `veyr graph` again shortly to check."));
        return;
      }
    } else {
      console.log(chalk.dim("building locally — this can take a few seconds to a few minutes on a large repo"));
      const built = await buildGraphLocally(process.cwd(), (line) => console.log(chalk.dim(line)));
      if (!built.ok) {
        console.log(chalk.red(`✗ ${built.reason}`));
        process.exitCode = 1;
        return;
      }
      result = readGraphCacheFromFile();
      if (result.kind === "missing") {
        console.log(chalk.red("✗ build finished but the graph cache is unreadable."));
        process.exitCode = 1;
        return;
      }
    }
  } else {
    result = await readGraphCache();
  }

  if (opts.json) {
    console.log(JSON.stringify(result.kind === "missing" ? result : result.payload, null, 2));
    return;
  }

  if (result.kind === "missing") {
    console.log(chalk.dim("○ no graph yet — run `veyr graph --refresh` in your project to build one (needs Python 3.10+)"));
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

  await renderUnderstanding();
}

/** What Veyr currently understands about the project — the graph_context the
 * agent-status feed carries (same data the VS Code sidebar and the Mac app's
 * Agent tab show): the architectural overview, the token-savings estimate,
 * and the file the agent is currently working in, when known. */
async function renderUnderstanding(): Promise<void> {
  const status = await readStatus();
  if (status.kind === "missing") return;
  const graph = status.status.graph_context;
  if (!graph?.available) return;

  console.log();
  console.log(chalk.bold("Current understanding"));
  console.log(`  ${graph.architectural_overview}`);

  const savings = graph.token_savings_estimate;
  if (savings && (savings.savings_this_session > 0 || savings.savings_this_month > 0)) {
    console.log(
      `  Saves your agent ~${fmtTokens(savings.savings_this_session)} exploration tokens this session` +
        chalk.dim(` (~${fmtTokens(savings.savings_this_month)}/mo)`) +
        (graph.is_partial ? chalk.yellow(" — partial graph") : "")
    );
  }

  const active = graph.active_file_summary;
  if (active) {
    console.log();
    console.log(chalk.bold("Active context") + `  ${active.name}` + chalk.dim(`  (${active.file})`));
    if (active.callers.length > 0) console.log(chalk.dim(`  Called by: ${active.callers.join(", ")}`));
    if (active.callees.length > 0) console.log(chalk.dim(`  Calls: ${active.callees.join(", ")}`));
    if (active.tests.length > 0) console.log(chalk.dim(`  Tests: ${active.tests.join(", ")}`));
  }
}
