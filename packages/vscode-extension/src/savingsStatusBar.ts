// Retrospective savings status bar item — current-project total prominent,
// lifetime + full breakdown available via click-through
// ("veyr.showSavingsDetail"). Off by default (veyr.savingsTracker):
// this item is only created/shown when the setting is on, same gating
// discipline as the daemon route and every other client.
//
// No client is allowed to blend confidence tiers into one unlabeled figure
// — the status bar shows a total (sum of whatever's available) but the
// click-through detail view always breaks it out by component, tagged.

import * as vscode from "vscode";
import { daemonGet } from "./daemonClient";

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

function formatUsd(n: number): string {
  return `$${n.toFixed(n !== 0 && Math.abs(n) < 0.01 ? 4 : 2)}`;
}

const POLL_INTERVAL_MS = 30_000;

export class VeyrSavingsStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | undefined;
  private latest: SavingsResponse | undefined;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      "veyr.savings",
      vscode.StatusBarAlignment.Right,
      98,
    );
    this.item.name = "Veyr savings tracker";
    this.item.command = "veyr.showSavingsDetail";
  }

  start(): void {
    this.applyConfig();
  }

  onConfigChanged(): void {
    this.applyConfig();
  }

  private applyConfig(): void {
    const enabled = vscode.workspace.getConfiguration("veyr").get<boolean>("savingsTracker", false);
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (!enabled) {
      this.item.hide();
      return;
    }
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
  }

  private async refresh(): Promise<void> {
    const response = await daemonGet<SavingsResponse>("/savings", 1000);
    this.latest = response ?? undefined;
    this.render();
  }

  private render(): void {
    if (!this.latest || !this.latest.enabled) {
      this.item.hide();
      return;
    }
    const usd = this.latest.currentProject ? totalUsd(this.latest.currentProject) : 0;
    this.item.text = `$(sparkle) ${formatUsd(usd)} saved`;
    this.item.tooltip = "Veyr — estimated savings for this project. Click for the full breakdown + lifetime total.";
    this.item.show();
  }

  getLatest(): SavingsResponse | undefined {
    return this.latest;
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.item.dispose();
  }
}

export async function showSavingsDetailCommand(statusBar: VeyrSavingsStatusBar): Promise<void> {
  const response = statusBar.getLatest() ?? (await daemonGet<SavingsResponse>("/savings", 1000)) ?? undefined;
  const channel = vscode.window.createOutputChannel("Veyr Savings");
  channel.clear();
  if (!response || !response.enabled) {
    channel.appendLine("Savings tracker is off (or the Veyr menu bar app isn't running).");
    channel.appendLine("Enable it in Settings → Veyr → Prompt Style Learning... (veyr.savingsTracker), or run:");
    channel.appendLine("  veyr savings enable");
    channel.show();
    return;
  }

  const line = (label: string, totals: SavingsTotals): void => {
    channel.appendLine(`${label}: ${formatUsd(totalUsd(totals))}`);
    if (totals.component1MeasuredTokens > 0) {
      channel.appendLine(
        `  Graph exploration: ${Math.round(totals.component1MeasuredTokens)} tokens / ` +
          `${formatUsd(totals.component1MeasuredUSD)} (measured — vs. your own no-graph history)`,
      );
    }
    if (totals.component1AssumptionTokens > 0) {
      channel.appendLine(
        `  Graph exploration: ${Math.round(totals.component1AssumptionTokens)} tokens / ` +
          `${formatUsd(totals.component1AssumptionUSD)} (estimated — not enough personal history yet)`,
      );
    }
    if (totals.component3CorrelationalTokens > 0) {
      channel.appendLine(
        `  Guidance verbosity: ${Math.round(totals.component3CorrelationalTokens)} tokens / ` +
          `${formatUsd(totals.component3CorrelationalUSD)} (correlational, not causal)`,
      );
    }
  };

  line("Lifetime", response.lifetime);
  channel.appendLine("");
  if (response.currentProject && response.currentProjectTag) {
    line(`This project (${response.currentProjectTag})`, response.currentProject);
  } else {
    channel.appendLine("This project: no data yet.");
  }
  if (response.component2RedundantReadTokensThisSession > 0) {
    channel.appendLine("");
    channel.appendLine(
      `Redundant re-reads this session: ${Math.round(response.component2RedundantReadTokensThisSession)} ` +
        "tokens (informational — a measured cost, not a savings claim; never counted above)",
    );
  }
  channel.appendLine("");
  channel.appendLine(`Note on guidance verbosity: ${response.component3Disclaimer}`);
  channel.show();
}
