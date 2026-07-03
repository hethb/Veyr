// Veyr VS Code extension.
//
//  - Status bar: live session cost from the local Veyr agent feed
//    (~/.veyr/agent-status/VEYR_STATUS.json, written by the Veyr Mac app).
//  - Activity Bar panel: live session section (local feed) + spend and
//    optimization suggestions from the local proxy when it's running.
//  - Command to route Claude Code through the Veyr proxy via ANTHROPIC_BASE_URL.

import * as vscode from "vscode";
import {
  commandFor,
  formatTokens,
  formatUsd,
  pollIntervalMs,
  readStatus,
  writeAutoInjectClaudeMd,
  type VeyrStatusResult,
} from "./agentStatus";
import { VeyrStatusBar } from "./statusBar";

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("veyr");
}

function proxyUrl(): string {
  return cfg().get<string>("proxyUrl", "http://localhost:3001").replace(/\/$/, "");
}

function dashboardUrl(): string {
  return cfg().get<string>("dashboardUrl", "http://localhost:5173/dashboard");
}

async function fetchJson(path: string): Promise<unknown> {
  const res = await fetch(`${proxyUrl()}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtProxyUsd(value: unknown): string {
  const num = typeof value === "number" ? value : 0;
  return `$${num.toFixed(num < 1 ? 4 : 2)}`;
}

function escapeHtml(value: unknown): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  };
  return String(value ?? "").replace(/[&<>"]/g, (c) => replacements[c] ?? c);
}

// ---------------------------------------------------------------------------
// Proxy payload shapes (loosely validated — the proxy is optional)
// ---------------------------------------------------------------------------

interface ProxyPeriod {
  readonly cost?: number;
}

interface ProxyOverview {
  readonly today?: ProxyPeriod;
  readonly week?: ProxyPeriod;
  readonly month?: ProxyPeriod;
}

interface ProxySuggestion {
  readonly severity?: string;
  readonly category?: string;
  readonly title?: string;
  readonly description?: string;
  readonly impact_usd?: number;
  readonly quick_win?: boolean;
}

interface PanelState {
  readonly agent: VeyrStatusResult;
  readonly overview?: ProxyOverview;
  readonly suggestions?: readonly ProxySuggestion[];
  readonly proxyError?: string;
}

// ---------------------------------------------------------------------------
// Webview view
// ---------------------------------------------------------------------------

class VeyrViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((msg: unknown) => {
      if (typeof msg !== "object" || msg === null) return;
      const message = msg as Record<string, unknown>;
      if (message["type"] === "openDashboard") {
        void vscode.env.openExternal(vscode.Uri.parse(dashboardUrl()));
      } else if (message["type"] === "copyCommand" && typeof message["command"] === "string") {
        void vscode.env.clipboard.writeText(message["command"]).then(() => {
          void vscode.window.showInformationMessage(
            `Copied ${message["command"]} — paste it into your Claude Code session.`,
          );
        });
      }
    });
    void this.refresh();

    view.onDidChangeVisibility(() => {
      if (view.visible) void this.refresh();
    });
    this.restartTimer();
  }

  restartTimer(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.view?.visible) void this.refresh();
    }, pollIntervalMs());
  }

  async refresh(): Promise<void> {
    if (!this.view) return;
    const agent = readStatus();
    try {
      const [overview, suggestions] = await Promise.all([
        fetchJson("/api/stats/overview"),
        fetchJson("/api/analysis/suggestions"),
      ]);
      this.view.webview.html = render({
        agent,
        overview: overview as ProxyOverview,
        suggestions: Array.isArray(suggestions) ? (suggestions as ProxySuggestion[]) : [],
      });
    } catch (err) {
      this.view.webview.html = render({
        agent,
        proxyError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  dispose(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderLiveSession(agent: VeyrStatusResult): string {
  if (agent.kind === "missing") {
    return `
      <h3>Live session</h3>
      <p class="muted">No Veyr agent feed found. Launch the <b>Veyr menu bar app</b> —
      it reads your local Claude Code logs and writes
      <code>~/.veyr/agent-status/VEYR_STATUS.json</code>. Nothing leaves your machine.</p>`;
  }

  const session = agent.status.current_session;
  if (!session) {
    return `
      <h3>Live session</h3>
      <p class="muted">Veyr is running, but no coding-agent session has been seen yet.</p>`;
  }

  const state = agent.kind === "stale"
    ? '<span class="badge">stale feed</span>'
    : session.is_active
      ? '<span class="badge live">● active</span>'
      : '<span class="badge">idle</span>';

  const top = agent.status.recommendations[0];
  const topCommand = top ? commandFor(top) : undefined;
  const recommendation = top
    ? `
      <div class="sugg sev-${escapeHtml(top.priority)}">
        <div class="t">💡 ${escapeHtml(rectitle(top.action, top.suggested_model))}</div>
        <div class="d">${escapeHtml(top.reason)}</div>
        ${top.estimated_savings_per_hour_usd > 0
          ? `<div class="save" style="margin-top:4px">Saves ~${formatUsd(top.estimated_savings_per_hour_usd)}/hr</div>`
          : ""}
        ${topCommand
          ? `<button onclick="copyCommand('${escapeHtml(topCommand)}')">Copy ${escapeHtml(topCommand)} ↗</button>`
          : ""}
      </div>`
    : "";

  return `
    <h3>Live session ${state}</h3>
    <table class="kv">
      <tr><td>Model</td><td><b>${escapeHtml(session.model)}</b></td></tr>
      <tr><td>Project</td><td>${escapeHtml(session.project)}</td></tr>
      <tr><td>Cost</td><td><b>${formatUsd(session.session_cost_usd)}</b></td></tr>
      <tr><td>Burn rate</td><td>$${session.cost_per_minute.toFixed(3)} / min</td></tr>
      <tr><td>Cache</td><td>${Math.round(session.cache_hit_rate * 100)}% hit rate${session.cache_hit_rate > 0.3 ? " ⚡" : ""}</td></tr>
      <tr><td>Tokens</td><td>${formatTokens(session.input_tokens)}↓&nbsp; ${formatTokens(session.output_tokens)}↑</td></tr>
    </table>
    ${recommendation}`;
}

function rectitle(action: string, suggestedModel: string | undefined): string {
  switch (action) {
    case "switch_model":
      return `Switch to ${suggestedModel ?? "a smaller model"}`;
    case "compact_context":
      return "Run /compact";
    default:
      return action.replaceAll("_", " ");
  }
}

function render(state: PanelState): string {
  const styles = `
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; font-size: 12px; }
    h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--vscode-descriptionForeground); margin: 16px 0 6px; }
    h3:first-child { margin-top: 0; }
    .row { display:flex; justify-content:space-between; padding:3px 0; }
    .row b { font-weight:600; }
    .cards { display:flex; gap:6px; margin-bottom:8px; }
    .card { flex:1; border:1px solid var(--vscode-panel-border); border-radius:6px; padding:8px; text-align:center; }
    .card .v { font-size:15px; font-weight:600; }
    .card .l { color: var(--vscode-descriptionForeground); font-size:10px; }
    .kv { width:100%; border-collapse:collapse; margin-bottom:8px; }
    .kv td { padding:2px 0; }
    .kv td:first-child { color: var(--vscode-descriptionForeground); width:80px; }
    .sugg { border:1px solid var(--vscode-panel-border); border-left-width:3px; border-radius:6px; padding:8px; margin-bottom:6px; }
    .sev-high { border-left-color:#e5484d; } .sev-medium { border-left-color:#f5a623; } .sev-low { border-left-color:#4fabff; }
    .sugg .t { font-weight:600; margin-bottom:2px; }
    .sugg .d { color: var(--vscode-descriptionForeground); line-height:1.4; }
    .save { color:#3fb950; font-weight:600; }
    .badge { font-size:9px; text-transform:uppercase; letter-spacing:.05em; border:1px solid var(--vscode-panel-border); border-radius:4px; padding:1px 5px; color: var(--vscode-descriptionForeground); }
    .badge.live { color:#3fb950; border-color:#3fb950; }
    .muted { color: var(--vscode-descriptionForeground); line-height:1.5; }
    code { font-size: 10px; }
    button { font-family:inherit; cursor:pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border:none; border-radius:4px; padding:4px 8px; margin-top:6px; }
  `;

  const liveSection = renderLiveSession(state.agent);

  let proxySection: string;
  if (state.proxyError !== undefined) {
    proxySection = `
      <h3>Proxy</h3>
      <p class="muted">Proxy not reachable (${escapeHtml(state.proxyError)}) — optional.
      The live session above works without it. To also log routed API traffic:</p>
      <pre class="muted">npm run dev:proxy</pre>`;
  } else {
    const overview = state.overview ?? {};
    const suggestions = state.suggestions ?? [];
    const total = suggestions.reduce((sum, s) => sum + (s.impact_usd ?? 0), 0);
    const cards = `
      <div class="cards">
        <div class="card"><div class="v">${fmtProxyUsd(overview.today?.cost)}</div><div class="l">Today</div></div>
        <div class="card"><div class="v">${fmtProxyUsd(overview.week?.cost)}</div><div class="l">Week</div></div>
        <div class="card"><div class="v">${fmtProxyUsd(overview.month?.cost)}</div><div class="l">Month</div></div>
      </div>`;
    const suggestionsHtml = suggestions.length
      ? suggestions
          .map(
            (s) => `
          <div class="sugg sev-${escapeHtml(s.severity)}">
            <div class="row" style="margin-bottom:4px">
              <span class="badge">${escapeHtml(s.category)}</span>
              ${s.quick_win === true ? '<span class="badge" style="color:#3fb950">⚡ quick win</span>' : ""}
            </div>
            <div class="t">${escapeHtml(s.title)}</div>
            <div class="d">${escapeHtml(s.description)}</div>
            ${(s.impact_usd ?? 0) > 0 ? `<div style="margin-top:4px" class="save">Save ~${fmtProxyUsd(s.impact_usd)}/mo</div>` : ""}
          </div>`,
          )
          .join("")
      : `<p class="muted">No proxy suggestions yet.</p>`;
    const summary = suggestions.length
      ? `<p class="muted">${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} · est. <span class="save">${fmtProxyUsd(total)}/mo</span> savings</p>`
      : "";
    proxySection = `
      <h3>Proxy spend</h3>
      ${cards}
      <h3>Optimization suggestions</h3>
      ${summary}
      ${suggestionsHtml}`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${styles}</style></head>
  <body>
    ${liveSection}
    ${proxySection}
    <button onclick="openDash()">Open full dashboard</button>
  <script>
    const vscodeApi = acquireVsCodeApi();
    function openDash(){ vscodeApi.postMessage({ type: 'openDashboard' }); }
    function copyCommand(cmd){ vscodeApi.postMessage({ type: 'copyCommand', command: cmd }); }
  </script>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// Claude Code routing (unchanged behavior)
// ---------------------------------------------------------------------------

function platformEnvKey(): "osx" | "windows" | "linux" {
  if (process.platform === "darwin") return "osx";
  if (process.platform === "win32") return "windows";
  return "linux";
}

async function routeClaudeCode(): Promise<void> {
  const section = `terminal.integrated.env.${platformEnvKey()}`;
  const config = vscode.workspace.getConfiguration();
  const target = vscode.workspace.workspaceFolders
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  const current: Record<string, string> = { ...(config.get<Record<string, string>>(section) ?? {}) };
  current["ANTHROPIC_BASE_URL"] = `${proxyUrl()}/anthropic`;
  await config.update(section, current, target);

  const choice = await vscode.window.showInformationMessage(
    "Claude Code will now route through Veyr in new terminals. Make sure the proxy runs with VEYR_ALLOW_ANON=true so its traffic is logged.",
    "Open new terminal",
    "Copy env line",
  );
  if (choice === "Open new terminal") {
    vscode.window.createTerminal("Claude Code (Veyr)").show();
  } else if (choice === "Copy env line") {
    await vscode.env.clipboard.writeText(`export ANTHROPIC_BASE_URL=${proxyUrl()}/anthropic`);
    void vscode.window.showInformationMessage("Copied ANTHROPIC_BASE_URL export to clipboard.");
  }
}

async function unrouteClaudeCode(): Promise<void> {
  const section = `terminal.integrated.env.${platformEnvKey()}`;
  const config = vscode.workspace.getConfiguration();
  const target = vscode.workspace.workspaceFolders
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  const current: Record<string, string> = { ...(config.get<Record<string, string>>(section) ?? {}) };
  delete current["ANTHROPIC_BASE_URL"];
  await config.update(section, Object.keys(current).length ? current : undefined, target);
  void vscode.window.showInformationMessage(
    "Stopped routing Claude Code through Veyr. Open a new terminal to apply.",
  );
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const provider = new VeyrViewProvider();
  const statusBar = new VeyrStatusBar();
  statusBar.start();

  context.subscriptions.push(
    provider,
    statusBar,
    vscode.window.registerWebviewViewProvider("veyr.panel", provider),
    vscode.commands.registerCommand("veyr.refresh", () => {
      statusBar.refresh();
      void provider.refresh();
    }),
    vscode.commands.registerCommand("veyr.showPanel", () => {
      void vscode.commands.executeCommand("veyr.panel.focus");
    }),
    vscode.commands.registerCommand("veyr.routeClaudeCode", () => void routeClaudeCode()),
    vscode.commands.registerCommand("veyr.unrouteClaudeCode", () => void unrouteClaudeCode()),
    vscode.commands.registerCommand("veyr.openDashboard", () =>
      vscode.env.openExternal(vscode.Uri.parse(dashboardUrl())),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("veyr.autoInjectClaudeMd")) {
        const enabled = cfg().get<boolean>("autoInjectClaudeMd", false);
        try {
          writeAutoInjectClaudeMd(enabled);
          void vscode.window.showInformationMessage(
            enabled
              ? "Veyr will append spend status to your project's CLAUDE.md (applied by the Veyr menu bar app)."
              : "Veyr CLAUDE.md auto-update disabled.",
          );
        } catch (err) {
          void vscode.window.showErrorMessage(
            `Veyr: could not write ~/.veyr/config.json (${err instanceof Error ? err.message : String(err)})`,
          );
        }
      }
      if (
        event.affectsConfiguration("veyr.showCostInStatusBar") ||
        event.affectsConfiguration("veyr.pollIntervalSeconds") ||
        event.affectsConfiguration("veyr.agentStatusPath")
      ) {
        statusBar.onConfigChanged();
        provider.restartTimer();
      }
    }),
  );
}

export function deactivate(): void {}
