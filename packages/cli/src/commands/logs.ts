import chalk from "chalk";
import Table from "cli-table3";
import { apiGet, type RecentRequest } from "../api.js";
import { fmtTime, fmtUsd } from "../ui.js";

const COL_WIDTHS = [18, 17, 24, 10, 10];
const POLL_WINDOW = 50;

export interface LogsOptions {
  tag?: string;
  limit: string;
  follow?: boolean;
}

function recentPath(limit: number, tag?: string): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (tag) params.set("tag", tag);
  return `/api/stats/recent?${params.toString()}`;
}

function toRow(r: RecentRequest): string[] {
  return [
    fmtTime(r.timestamp),
    r.feature_tag ?? chalk.dim("untagged"),
    r.model,
    String(r.total_tokens),
    fmtUsd(r.cost_usd),
  ];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function logsCommand(opts: LogsOptions): Promise<void> {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 200);
  const rows = await apiGet<RecentRequest[]>(recentPath(limit, opts.tag));

  if (rows.length === 0) {
    const scope = opts.tag ? ` for tag "${opts.tag}"` : "";
    console.log(chalk.yellow(`No requests logged yet${scope}.`));
    if (!opts.follow) return;
  }

  console.log(chalk.bold(`Recent requests`) + chalk.dim(`  (last ${limit})`));
  const table = new Table({
    head: ["Time", "Feature", "Model", "Tokens", "Cost"],
    colWidths: COL_WIDTHS,
    style: { head: [] },
  });
  // API returns newest first; render oldest at the top like `tail`.
  for (const r of [...rows].reverse()) table.push(toRow(r));
  console.log(table.toString());

  if (!opts.follow) return;

  console.log(chalk.dim("Following new requests — Ctrl-C to stop."));
  // Seed `seen` from a window at least as wide as the poll window, so rows
  // that existed before we started (but weren't displayed) never replay as
  // "new" once newer traffic pushes them around inside the window.
  const seen = new Set(rows.map((r) => r.id));
  try {
    const baseline = await apiGet<RecentRequest[]>(recentPath(POLL_WINDOW, opts.tag));
    for (const r of baseline) seen.add(r.id);
  } catch {
    // poll loop below reports unreachability
  }
  for (;;) {
    await sleep(2000);
    let latest: RecentRequest[];
    try {
      latest = await apiGet<RecentRequest[]>(recentPath(POLL_WINDOW, opts.tag));
    } catch {
      console.log(chalk.red("✗ Proxy unreachable — retrying..."));
      continue;
    }
    const fresh = latest.filter((r) => !seen.has(r.id)).reverse();
    for (const r of fresh) {
      seen.add(r.id);
      // Plain aligned row (no table chrome) so appended output reads like tail -f.
      const cells = toRow(r);
      console.log(
        `  ${cells[0].padEnd(16)}${cells[1].padEnd(15)}${cells[2].padEnd(22)}${cells[3].padEnd(8)}${cells[4]}`
      );
    }
  }
}
