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

## Live session from the Veyr agent feed (no proxy needed)

When the Veyr menu bar app is running, the extension reads
`~/.veyr/agent-status/VEYR_STATUS.json` (local file, nothing leaves your
machine) and shows:

- **Status bar** (right side): `$(graph-line) $0.84 · 14k↓ 3k↑` — live session
  cost and tokens, with a ● dot while the session is active. Shows
  `Veyr: inactive` when the feed is missing or stale (>2 min). Click to open
  the Veyr panel.
- **Panel → Live session**: model, cost, burn rate, cache hit rate, tokens, and
  the top optimization recommendation with a one-click copy button
  (`/model …`, `/compact`).

Settings: `veyr.agentStatusPath`, `veyr.showCostInStatusBar`,
`veyr.pollIntervalSeconds`, and `veyr.autoInjectClaudeMd` (shared with the Mac
app via `~/.veyr/config.json`; the Mac app performs the CLAUDE.md updates).

## Development

```bash
npm install
npm run build     # tsc → out/
```

Open this folder in VS Code and press **F5**. Package with `vsce package`
(runs the build via `vscode:prepublish`).
