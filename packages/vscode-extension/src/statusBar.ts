// Live session cost in the VS Code status bar:  $(graph-line) $0.84 · 14k↓ 3k↑
// Polls VEYR_STATUS.json (default every 10s). Missing/stale feed → "Veyr: inactive".

import * as vscode from "vscode";
import {
  fetchTodaySavingsPct,
  formatTokens,
  formatUsd,
  pollIntervalMs,
  readStatus,
  type VeyrStatusResult,
} from "./agentStatus";
import { maybeNotifyModelSuggestion } from "./modelSuggestionNotifier";

export class VeyrStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | undefined;
  private savingsTimer: ReturnType<typeof setInterval> | undefined;
  private todaySavingsPct: number | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      "veyr.sessionCost",
      vscode.StatusBarAlignment.Right,
      99,
    );
    this.item.name = "Veyr session cost";
    this.item.command = "veyr.showPanel";
  }

  start(): void {
    this.applyConfig();
    this.restartTimer();
    void this.refreshSavings();
    this.savingsTimer = setInterval(() => void this.refreshSavings(), 60_000);
  }

  private async refreshSavings(): Promise<void> {
    this.todaySavingsPct = await fetchTodaySavingsPct();
  }

  onConfigChanged(): void {
    this.applyConfig();
    this.restartTimer();
  }

  refresh(): void {
    const result = readStatus();
    this.render(result);
    maybeNotifyModelSuggestion(result);
  }

  private applyConfig(): void {
    const show = vscode.workspace
      .getConfiguration("veyr")
      .get<boolean>("showCostInStatusBar", true);
    if (show) {
      this.refresh();
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  private restartTimer(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), pollIntervalMs());
  }

  private render(result: VeyrStatusResult): void {
    if (result.kind === "missing" || result.kind === "stale" || !result.status.current_session) {
      this.item.text = "$(graph-line) Veyr: inactive";
      this.item.tooltip =
        result.kind === "missing"
          ? "No Veyr agent feed found. Launch the Veyr menu bar app to start tracking."
          : "Veyr feed is stale — the menu bar app may not be running.";
      return;
    }

    const session = result.status.current_session;
    const dot = session.is_active ? "$(circle-filled) " : "";
    const savings =
      this.todaySavingsPct !== null ? ` · ${this.todaySavingsPct}% saved ⚡` : "";
    this.item.text =
      `${dot}$(graph-line) ${formatUsd(session.session_cost_usd)} · ` +
      `${formatTokens(session.input_tokens)}↓ ${formatTokens(session.output_tokens)}↑${savings}`;

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**Veyr — ${session.project}** (${session.model})\n\n`);
    tooltip.appendMarkdown(`- Session cost: ${formatUsd(session.session_cost_usd)}\n`);
    tooltip.appendMarkdown(`- Burn rate: $${session.cost_per_minute.toFixed(3)}/min\n`);
    tooltip.appendMarkdown(
      `- Cache hit rate: ${Math.round(session.cache_hit_rate * 100)}%\n`,
    );
    tooltip.appendMarkdown(`\n_Click to open the Veyr panel._`);
    this.item.tooltip = tooltip;
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    if (this.savingsTimer !== undefined) clearInterval(this.savingsTimer);
    this.item.dispose();
  }
}
