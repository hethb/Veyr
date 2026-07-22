// `veyr savings` — retrospective token/dollar savings tracker: lifetime +
// current-project totals, each component confidence-tagged (measured /
// assumption / correlational — never blended into one opaque figure).
// Prefers the daemon (which also computes the live redundant-read figure);
// falls back to reading ~/.veyr/savings.json directly — the stored totals
// are all there, only the current-session redundant-read observation needs
// the live app. `--projects` lists every project's totals straight from the
// store (the daemon only reports lifetime + the current project).

import chalk from "chalk";
import { daemonGet } from "../veyr/daemon.js";
import { readSavingsTracker, writeConfigKey } from "../veyr/config.js";
import { readSavingsStore, totalUsd as storeTotalUsd, type SavingsTotals as StoreTotals } from "../veyr/savingsStore.js";
import { loadTagInferrer } from "../veyr/tags.js";
import { fmtCount, fmtUsd, renderColumns } from "../ui.js";

interface SavingsTotals {
  readonly component1MeasuredTokens: number;
  readonly component1MeasuredUSD: number;
  readonly component1AssumptionTokens: number;
  readonly component1AssumptionUSD: number;
  readonly component3CorrelationalTokens: number;
  readonly component3CorrelationalUSD: number;
}

interface SavingsResponse {
  readonly enabled: boolean;
  readonly lifetime: SavingsTotals;
  readonly currentProjectTag?: string;
  readonly currentProject?: SavingsTotals;
  readonly component2RedundantReadTokensThisSession: number;
  readonly component3Disclaimer: string;
}

function totalUsd(totals: SavingsTotals): number {
  return totals.component1MeasuredUSD + totals.component1AssumptionUSD + totals.component3CorrelationalUSD;
}

function renderTotals(label: string, totals: SavingsTotals, detail: boolean): void {
  console.log(chalk.bold(label) + `  ${fmtUsd(totalUsd(totals))}`);
  if (totals.component1MeasuredTokens > 0) {
    console.log(
      `  Graph exploration — ${fmtCount(Math.round(totals.component1MeasuredTokens))} tokens / ` +
        `${fmtUsd(totals.component1MeasuredUSD)}` +
        chalk.dim(" (measured — vs. your own no-graph history for repos this size)")
    );
  }
  if (totals.component1AssumptionTokens > 0) {
    console.log(
      `  Graph exploration — ${fmtCount(Math.round(totals.component1AssumptionTokens))} tokens / ` +
        `${fmtUsd(totals.component1AssumptionUSD)}` +
        chalk.dim(" (estimated — not enough personal no-graph history yet, see --detail)")
    );
  }
  if (totals.component3CorrelationalTokens > 0) {
    console.log(
      `  Guidance verbosity — ${fmtCount(Math.round(totals.component3CorrelationalTokens))} tokens / ` +
        `${fmtUsd(totals.component3CorrelationalUSD)}` +
        chalk.dim(" (correlational, see --detail)")
    );
  }
  if (
    detail &&
    totals.component1MeasuredTokens === 0 &&
    totals.component1AssumptionTokens === 0 &&
    totals.component3CorrelationalTokens === 0
  ) {
    console.log(chalk.dim("  No components have data yet."));
  }
}

/** Offline path: totals from ~/.veyr/savings.json, current project inferred
 * from the cwd the same way the app tags sessions. The one thing this can't
 * show is the live redundant-read figure — that needs the running app. */
function renderFromStore(opts: { detail?: boolean }): void {
  if (!readSavingsTracker()) {
    console.log(
      chalk.dim("Savings tracker is off.") +
        chalk.dim(" Run `veyr savings enable` to start tracking (off by default).")
    );
    return;
  }
  const store = readSavingsStore();
  if (store === null) {
    console.log(chalk.dim("○ tracker is on, but nothing has been recorded yet — recording runs in the Veyr desktop app, so totals appear after its next active session."));
    return;
  }
  console.log(chalk.yellow("● offline") + chalk.dim(" · app not running — totals read from ~/.veyr/savings.json"));
  console.log();
  renderTotals("Lifetime", store.lifetimeTotals, opts.detail ?? false);
  console.log();
  const currentTag = loadTagInferrer().inferTag(process.cwd());
  const projectTotals = store.perProjectTotals[currentTag];
  if (projectTotals) {
    renderTotals(`This project (${currentTag})`, projectTotals, opts.detail ?? false);
  } else {
    console.log(chalk.dim(`This project (${currentTag}): no data yet.`));
  }
  console.log();
  console.log(chalk.dim("Redundant re-reads (current session) need the running app — skipped."));
}

function renderProjectsBreakdown(): void {
  const store = readSavingsStore();
  const projects = Object.entries(store?.perProjectTotals ?? {}).sort(
    (a, b) => storeTotalUsd(b[1]) - storeTotalUsd(a[1])
  );
  if (store === null || projects.length === 0) {
    console.log(chalk.dim("○ no per-project savings recorded yet."));
    return;
  }
  console.log(chalk.bold("Savings by project") + chalk.dim("  (all time, all confidence tiers summed)"));
  const rows = projects.map(([tag, totals]: [string, StoreTotals]) => [
    tag,
    chalk.bold(fmtUsd(storeTotalUsd(totals))),
    chalk.dim(
      `${fmtUsd(totals.component1MeasuredUSD)} measured · ` +
        `${fmtUsd(totals.component1AssumptionUSD)} estimated · ` +
        `${fmtUsd(totals.component3CorrelationalUSD)} correlational`
    ),
  ]);
  for (const line of renderColumns(rows, { rightAlign: [1] })) console.log(line);
  console.log();
  console.log(chalk.dim("Run `veyr savings --detail` for what each confidence tier means."));
}

export async function savingsCommand(opts: { detail?: boolean; projects?: boolean }): Promise<void> {
  if (opts.projects) {
    renderProjectsBreakdown();
    return;
  }
  const response = await daemonGet<SavingsResponse>("/savings", 1000);
  if (response === null) {
    renderFromStore(opts);
    return;
  }
  if (!response.enabled) {
    console.log(
      chalk.dim("Savings tracker is off.") +
        chalk.dim(" Run `veyr savings enable` to start tracking (off by default).")
    );
    return;
  }

  renderTotals("Lifetime", response.lifetime, opts.detail ?? false);
  console.log();
  if (response.currentProject && response.currentProjectTag) {
    renderTotals(`This project (${response.currentProjectTag})`, response.currentProject, opts.detail ?? false);
  } else {
    console.log(chalk.dim("This project: no data yet."));
  }

  if (response.component2RedundantReadTokensThisSession > 0) {
    console.log();
    console.log(
      chalk.bold("Redundant re-reads this session") +
        `  ${fmtCount(Math.round(response.component2RedundantReadTokensThisSession))} tokens` +
        chalk.dim(" (informational — a measured cost, not a savings claim; never counted above)")
    );
  }

  if (opts.detail) {
    console.log();
    console.log(chalk.bold("Methodology"));
    console.log(chalk.dim("  Graph exploration (measured): (your historical avg. files read per task of this"));
    console.log(chalk.dim("  size, without graph) minus (files read this session, with graph) × ~500 tokens/read."));
    console.log(chalk.dim("  Falls back to a flat, clearly-labeled estimate until you have 5+ no-graph sessions"));
    console.log(chalk.dim("  in that size tier — most users will see the estimate, not the measured figure."));
    console.log(chalk.dim("  Guidance verbosity (correlational): " + response.component3Disclaimer));
    console.log(chalk.dim("  Redundant re-reads: same-file Read-tool calls beyond the first, this session only."));
  }
}

export async function savingsEnableCommand(): Promise<void> {
  writeConfigKey("savingsTracker", true);
  console.log(chalk.green("✓ savingsTracker ON"));
  console.log(chalk.dim("  Recording runs in the Veyr desktop app — its next tick starts accumulating baselines."));
  console.log(chalk.dim("  (CLI-only install? This toggle is shared; totals appear once the app runs.)"));
}

export async function savingsDisableCommand(): Promise<void> {
  writeConfigKey("savingsTracker", false);
  console.log(chalk.green("✓ savingsTracker OFF"));
  console.log(chalk.dim("  Stops accumulating new data; nothing already recorded is deleted."));
}

export async function savingsStatusCommand(): Promise<void> {
  const enabled = readSavingsTracker();
  console.log(
    enabled
      ? chalk.green("savingsTracker: ON")
      : chalk.dim("savingsTracker: OFF") + chalk.dim("  — run `veyr savings enable` to turn it on")
  );
}
