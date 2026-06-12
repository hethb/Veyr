# Canopy for VSCode

Brings Canopy cost attribution and optimization suggestions into your
editor, and routes **Claude Code** through the Canopy proxy so its usage is
logged like any other LLM traffic.

## Features

- **Canopy panel** in the Activity Bar — shows today / week / month spend
  and your optimization suggestions, pulled live from the local proxy
  (`http://localhost:3001`). Auto-refreshes every 30s; refresh manually with the
  toolbar button.
- **Route Claude Code through the proxy** — a command that sets
  `ANTHROPIC_BASE_URL` on your integrated-terminal environment so `claude` calls
  flow through Canopy.

## Run it

This extension is plain JS — no build step.

1. Open this folder (`packages/vscode-extension`) in VSCode.
2. Press **F5** to launch an Extension Development Host.
3. Click the Canopy icon in the Activity Bar.

(To install it permanently, package with [`vsce`](https://github.com/microsoft/vscode-vsce):
`npx @vscode/vsce package`, then install the resulting `.vsix`.)

## Routing Claude Code through Canopy

1. Start the proxy with anonymous local traffic enabled (Claude Code can't send
   a Canopy key):

   ```bash
   PROMPTLENS_ALLOW_ANON=true npm run dev:proxy
   ```

2. Run the command **Canopy: Route Claude Code through proxy** (Command
   Palette). This sets `ANTHROPIC_BASE_URL=http://localhost:3001/anthropic` for
   new integrated terminals.
3. Open a **new** terminal and run `claude` as usual. Its requests now appear in
   the Canopy panel and dashboard.

Run **Canopy: Stop routing Claude Code through proxy** to undo it.

## Settings

- `promptlens.proxyUrl` — proxy base URL (default `http://localhost:3001`)
- `promptlens.dashboardUrl` — dashboard URL opened by the "Open dashboard" button

## Type-checking (optional)

For editor type hints, install VSCode types in this folder:

```bash
npm install -D @types/vscode
```
