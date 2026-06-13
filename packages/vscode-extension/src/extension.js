// Veyr VSCode extension (plain CommonJS — no build step required).
//
//  - Adds a "Veyr" view to the Activity Bar that shows your logged spend
//    and optimization suggestions from the local proxy.
//  - Adds a command to route Claude Code through the proxy by setting
//    ANTHROPIC_BASE_URL on the integrated terminal environment.

const vscode = require("vscode");

function cfg() {
  return vscode.workspace.getConfiguration("promptlens");
}
function proxyUrl() {
  return (cfg().get("proxyUrl") || "http://localhost:3001").replace(/\/$/, "");
}
function dashboardUrl() {
  return cfg().get("dashboardUrl") || "http://localhost:5173/dashboard";
}

async function fetchJson(path) {
  const res = await fetch(`${proxyUrl()}${path}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function fmtUsd(n) {
  const v = typeof n === "number" ? n : 0;
  return `$${v.toFixed(v < 1 ? 4 : 2)}`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// ---------------------------------------------------------------------------
// Webview view
// ---------------------------------------------------------------------------
class PromptLensViewProvider {
  constructor() {
    this.view = undefined;
    this.timer = undefined;
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.onDidReceiveMessage((msg) => {
      if (msg && msg.type === "openDashboard") {
        vscode.env.openExternal(vscode.Uri.parse(dashboardUrl()));
      }
    });
    this.refresh();

    view.onDidChangeVisibility(() => {
      if (view.visible) this.refresh();
    });
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.view && this.view.visible) this.refresh();
    }, 30000);
  }

  async refresh() {
    if (!this.view) return;
    try {
      const [overview, suggestions] = await Promise.all([
        fetchJson("/api/stats/overview"),
        fetchJson("/api/analysis/suggestions"),
      ]);
      this.view.webview.html = render({ overview, suggestions });
    } catch (err) {
      this.view.webview.html = render({ error: String((err && err.message) || err) });
    }
  }
}

function render(state) {
  const styles = `
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; font-size: 12px; }
    h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--vscode-descriptionForeground); margin: 16px 0 6px; }
    .row { display:flex; justify-content:space-between; padding:3px 0; }
    .row b { font-weight:600; }
    .cards { display:flex; gap:6px; margin-bottom:8px; }
    .card { flex:1; border:1px solid var(--vscode-panel-border); border-radius:6px; padding:8px; text-align:center; }
    .card .v { font-size:15px; font-weight:600; }
    .card .l { color: var(--vscode-descriptionForeground); font-size:10px; }
    .sugg { border:1px solid var(--vscode-panel-border); border-left-width:3px; border-radius:6px; padding:8px; margin-bottom:6px; }
    .sev-high { border-left-color:#e5484d; } .sev-medium { border-left-color:#f5a623; } .sev-low { border-left-color:#4fabff; }
    .sugg .t { font-weight:600; margin-bottom:2px; }
    .sugg .d { color: var(--vscode-descriptionForeground); line-height:1.4; }
    .save { color:#3fb950; font-weight:600; }
    .badge { font-size:9px; text-transform:uppercase; letter-spacing:.05em; border:1px solid var(--vscode-panel-border); border-radius:4px; padding:1px 5px; color: var(--vscode-descriptionForeground); }
    .muted { color: var(--vscode-descriptionForeground); line-height:1.5; }
    button { font-family:inherit; cursor:pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border:none; border-radius:4px; padding:6px 10px; margin-top:8px; }
  `;

  if (state.error) {
    return html(styles, `
      <h3>Proxy</h3>
      <p class="muted">Couldn't reach the proxy (${escapeHtml(state.error)}).<br/>
      Start it from the repo root:</p>
      <pre class="muted">npm run dev:proxy</pre>
      <button onclick="openDash()">Open dashboard</button>
    `);
  }

  const o = state.overview || { today: {}, week: {}, month: {} };
  const suggestions = Array.isArray(state.suggestions) ? state.suggestions : [];
  const total = suggestions.reduce((s, x) => s + (x.impact_usd || 0), 0);

  const cards = `
    <div class="cards">
      <div class="card"><div class="v">${fmtUsd(o.today.cost)}</div><div class="l">Today</div></div>
      <div class="card"><div class="v">${fmtUsd(o.week.cost)}</div><div class="l">Week</div></div>
      <div class="card"><div class="v">${fmtUsd(o.month.cost)}</div><div class="l">Month</div></div>
    </div>`;

  const suggHtml = suggestions.length
    ? suggestions
        .map(
          (s) => `
        <div class="sugg sev-${escapeHtml(s.severity)}">
          <div class="row" style="margin-bottom:4px">
            <span class="badge">${escapeHtml(s.category)}</span>
            ${s.quick_win ? '<span class="badge" style="color:#3fb950">⚡ quick win</span>' : ""}
          </div>
          <div class="t">${escapeHtml(s.title)}</div>
          <div class="d">${escapeHtml(s.description)}</div>
          ${s.impact_usd > 0 ? `<div style="margin-top:4px" class="save">Save ~${fmtUsd(s.impact_usd)}/mo</div>` : ""}
        </div>`
        )
        .join("")
    : `<p class="muted">No suggestions yet — route some traffic through the proxy and check back.</p>`;

  const summary = suggestions.length
    ? `<p class="muted">${suggestions.length} suggestion${suggestions.length === 1 ? "" : "s"} · est. <span class="save">${fmtUsd(total)}/mo</span> savings</p>`
    : "";

  return html(styles, `
    <h3>Spend</h3>
    ${cards}
    <h3>Optimization suggestions</h3>
    ${summary}
    ${suggHtml}
    <button onclick="openDash()">Open full dashboard</button>
  `);
}

function html(styles, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>${styles}</style></head>
  <body>${body}
  <script>
    const vscodeApi = acquireVsCodeApi();
    function openDash(){ vscodeApi.postMessage({ type: 'openDashboard' }); }
  </script>
  </body></html>`;
}

// ---------------------------------------------------------------------------
// Claude Code routing
// ---------------------------------------------------------------------------
function platformEnvKey() {
  if (process.platform === "darwin") return "osx";
  if (process.platform === "win32") return "windows";
  return "linux";
}

async function routeClaudeCode() {
  const key = platformEnvKey();
  const section = `terminal.integrated.env.${key}`;
  const config = vscode.workspace.getConfiguration();
  const target = vscode.workspace.workspaceFolders
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  const current = { ...(config.get(section) || {}) };
  current.ANTHROPIC_BASE_URL = `${proxyUrl()}/anthropic`;
  await config.update(section, current, target);

  const choice = await vscode.window.showInformationMessage(
    "Claude Code will now route through Veyr in new terminals. Make sure the proxy runs with PROMPTLENS_ALLOW_ANON=true so its traffic is logged.",
    "Open new terminal",
    "Copy env line"
  );
  if (choice === "Open new terminal") {
    vscode.window.createTerminal("Claude Code (Veyr)").show();
  } else if (choice === "Copy env line") {
    await vscode.env.clipboard.writeText(`export ANTHROPIC_BASE_URL=${proxyUrl()}/anthropic`);
    vscode.window.showInformationMessage("Copied ANTHROPIC_BASE_URL export to clipboard.");
  }
}

async function unrouteClaudeCode() {
  const section = `terminal.integrated.env.${platformEnvKey()}`;
  const config = vscode.workspace.getConfiguration();
  const target = vscode.workspace.workspaceFolders
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;
  const current = { ...(config.get(section) || {}) };
  delete current.ANTHROPIC_BASE_URL;
  await config.update(section, Object.keys(current).length ? current : undefined, target);
  vscode.window.showInformationMessage(
    "Stopped routing Claude Code through Veyr. Open a new terminal to apply."
  );
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------
function activate(context) {
  const provider = new PromptLensViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("promptlens.panel", provider),
    vscode.commands.registerCommand("promptlens.refresh", () => provider.refresh()),
    vscode.commands.registerCommand("promptlens.routeClaudeCode", routeClaudeCode),
    vscode.commands.registerCommand("promptlens.unrouteClaudeCode", unrouteClaudeCode),
    vscode.commands.registerCommand("promptlens.openDashboard", () =>
      vscode.env.openExternal(vscode.Uri.parse(dashboardUrl()))
    )
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
