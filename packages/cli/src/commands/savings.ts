// `veyr savings` — retrospective token/dollar savings tracker: lifetime +
// current-project totals, each component confidence-tagged (measured /
// assumption / correlational — never blended into one opaque figure).
// There's no flat-file mirror of this data the way there is for
// status/graph, so daemon-absent genuinely means no data this run, not a
// fallback to a stale file — the command says so plainly.

import chalk from "chalk";
import { daemonGet } from "../veyr/daemon.js";
import { readSavingsTracker, writeConfigKey } from "../veyr/config.js";
import { fmtCount, fmtUsd } from "../ui.js";

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

export async function savingsCommand(opts: { detail?: boolean }): Promise<void> {
  const response = await daemonGet<SavingsResponse>("/savings", 1000);
  if (response === null) {
    console.log(chalk.dim("○ no data — the Veyr menu bar app isn't running (no file fallback for this one)."));
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
  console.log(chalk.dim("  The Mac app's next tick starts accumulating baselines. Numbers build up over time."));
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
