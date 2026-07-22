# Veyr for VSCode

Brings Veyr cost attribution and optimization suggestions into your
editor, and routes **Claude Code** through the Veyr proxy so its usage is
logged like any other LLM traffic.

## Features

- **Veyr panel** in the Activity Bar — shows today / week / month spend
  and your optimization suggestions, pulled live from the local proxy
  (`http://localhost:3001`). Auto-refreshes every 30s; refresh manually with the
  toolbar button.
- **Route Claude Code through the proxy** — a command that sets
  `ANTHROPIC_BASE_URL` on your integrated-terminal environment so `claude` calls
  flow through Veyr.

## Run it

This extension is plain JS — no build step.

1. Open this folder (`packages/vscode-extension`) in VSCode.
2. Press **F5** to launch an Extension Development Host.
3. Click the Veyr icon in the Activity Bar.

(To install it permanently, package with [`vsce`](https://github.com/microsoft/vscode-vsce):
`npx @vscode/vsce package`, then install the resulting `.vsix`.)

## Routing Claude Code through Veyr

1. Start the proxy with anonymous local traffic enabled (Claude Code can't send
   a Veyr key):

   ```bash
   VEYR_ALLOW_ANON=true npm run dev:proxy
   ```

2. Run the command **Veyr: Route Claude Code through proxy** (Command
   Palette). This sets `ANTHROPIC_BASE_URL=http://localhost:3001/anthropic` for
   new integrated terminals.
3. Open a **new** terminal and run `claude` as usual. Its requests now appear in
   the Veyr panel and dashboard.

Run **Veyr: Stop routing Claude Code through proxy** to undo it.

## Settings

- `veyr.proxyUrl` — proxy base URL (default `http://localhost:3001`)
- `veyr.dashboardUrl` — dashboard URL opened by the "Open dashboard" button

## Type-checking (optional)

For editor type hints, install VSCode types in this folder:

```bash
npm install -D @types/vscode
```

## Live session cost (no proxy, no app required)

The extension is standalone: it bundles `@veyr/core` (the same local-data
engine the CLI uses), so it scans your Claude Code / Codex session logs and
prices them itself. When the Veyr desktop app *is* running, its richer feed
(`~/.veyr/agent-status/VEYR_STATUS.json` — adds alerts, recommendations, and
graph context) is preferred automatically. Either way, everything is a local
file read — nothing leaves your machine. You get:

- **Status bar** (right side): `$(graph-line) $0.84 · 14k↓ 3k↑` — live session
  cost and tokens, with a ● dot while the session is active. Shows
  `Veyr: inactive` only when there are no session logs on the machine at all.
  Click to open the Veyr panel.
- **Panel → Live session**: model, cost, burn rate, cache hit rate, tokens —
  plus the top optimization recommendation (with one-click `/model …` /
  `/compact` copy buttons) when the app's feed is available.
- **Veyr: Build codebase graph** (command palette): builds the Graphify graph
  for the current workspace locally (needs Python 3.10+; first run installs
  Graphify from a pinned commit). View it with **Veyr: Open graph
  visualization** — no app needed.

Settings: `veyr.agentStatusPath`, `veyr.showCostInStatusBar`,
`veyr.pollIntervalSeconds`, and `veyr.autoInjectClaudeMd` (shared with the
desktop app via `~/.veyr/config.json`; the desktop app performs the CLAUDE.md
updates).

## Development

```bash
npm install       # from the repo root — links the @veyr/core workspace package
npm run build     # embed copy + tsc --noEmit + esbuild bundle → out/extension.js
npm run watch     # esbuild --watch for the F5 debug loop
```

The build bundles `@veyr/core` (a private, source-only workspace package)
into `out/extension.js`, so the .vsix stays self-contained with node_modules
excluded. Open this folder in VS Code and press **F5**. Package with
`vsce package` (runs the build via `vscode:prepublish`).
