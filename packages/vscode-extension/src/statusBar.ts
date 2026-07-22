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

  async refresh(): Promise<void> {
    const result = await readStatus();
    this.render(result);
    maybeNotifyModelSuggestion(result);
  }

  private applyConfig(): void {
    const show = vscode.workspace
      .getConfiguration("veyr")
      .get<boolean>("showCostInStatusBar", true);
    if (show) {
      void this.refresh();
      this.item.show();
    } else {
      this.item.hide();
    }
  }

  private restartTimer(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = setInterval(() => void this.refresh(), pollIntervalMs());
  }

  private render(result: VeyrStatusResult): void {
    // "missing"/"stale" only survive readStatus() when the local-log fallback
    // found nothing to compute from either — i.e. no agent logs on this machine.
    if (result.kind === "missing" || result.kind === "stale") {
      this.item.text = "$(graph-line) Veyr: inactive";
      this.item.tooltip =
        result.kind === "missing"
          ? "No session data found. Start a Claude Code or Codex session — Veyr reads local logs directly, no app required."
          : "Veyr feed is stale and no local session logs were found to compute from.";
      return;
    }

    // Graph savings take the suffix slot when available (spec 5b); the proxy
    // compression percentage is the fallback. Never both — one suffix.
    const graph = result.status.graph_context;
    const graphTokens = graph?.available
      ? graph.token_savings_estimate.savings_this_session
      : 0;
    const savings = graphTokens > 0
      ? ` · saved ${formatTokens(graphTokens)} tokens ⚡`
      : this.todaySavingsPct !== null
        ? ` · ${this.todaySavingsPct}% saved ⚡`
        : "";
    const session = result.status.current_session;

    // No live session: still show today's spend — the bar stays useful.
    if (!session || !session.is_active) {
      const today = result.status.today_spent_usd ?? session?.session_cost_usd ?? 0;
      this.item.text = `$(graph-line) ${formatUsd(today)} today${savings}`;
      this.item.tooltip =
        "Veyr — no active session. Today's total spend across Claude Code sessions. " +
        (result.kind === "local" ? "Computed locally from session logs. " : "") +
        "Click to open the Veyr panel.";
      return;
    }

    const dot = "$(circle-filled) ";
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
    if (graphTokens > 0) {
      tooltip.appendMarkdown(
        `- Graph savings: ~${formatTokens(graphTokens)} tokens this session` +
          `${graph?.is_partial ? " (partial graph)" : ""}\n`,
      );
    }
    if (result.kind === "local") {
      tooltip.appendMarkdown(`\n_Computed locally from session logs (Veyr app not running)._\n`);
    }
    tooltip.appendMarkdown(`\n_Click to open the Veyr panel._`);
    this.item.tooltip = tooltip;
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    if (this.savingsTimer !== undefined) clearInterval(this.savingsTimer);
    this.item.dispose();
  }
}
