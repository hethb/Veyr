# getcanopy — the Veyr CLI

Veyr's terminal surface: usage/cost, Graphify graph status, and the CLAUDE.md
agent-guidance rule set, all read straight from the same local `~/.veyr/`
files the Veyr menu bar app writes. No proxy, no account, no network calls —
this CLI never sends or intercepts a single request/response. It's a thin
reader (and, for guidance rules, a writer) of local JSON.

## Install

```bash
npm install -g getcanopy
```

## How it works

The Veyr menu bar app is the only thing that currently keeps `~/.veyr/`
fresh — it scans your coding-agent session logs, builds the Graphify graph,
and rewrites `~/.veyr/agent-status/VEYR_STATUS.json` every 30s while a
session is active (every 5 minutes when idle). This CLI just reads that file
(plus `~/.veyr/cache/graph.json` and `~/.veyr/guidance-rules.json`) and
renders it in your terminal. **The Veyr menu bar app needs to be running**
for `status`/`graph` to show live data — if it isn't, the CLI tells you so
plainly rather than showing stale numbers silently.

## Commands

| Command | What it does |
|---|---|
| `veyr status` | Current session cost, today's spend, budget, alerts, recommendations |
| `veyr status --watch` | Same, polling every 3s and re-rendering on change (not a live stream — see below) |
| `veyr status --json` | Raw `VEYR_STATUS.json` payload |
| `veyr graph` | Graphify graph status for whichever workspace Veyr last built |
| `veyr graph --top <n>` | Show more/fewer top-connected nodes (default 10) |
| `veyr graph --json` | Raw graph cache payload |
| `veyr rules list` | The agent-guidance rule set and whether injection is on |
| `veyr rules enable <id>` / `disable <id>` | Toggle one rule |
| `veyr rules on` / `off` | Toggle the whole `## Veyr agent guidance` CLAUDE.md section (default off) |

Rule/config changes take effect on the Mac app's next tick (≤5 minutes) —
there's no daemon process to signal for an instant refresh.

## What this CLI intentionally does not do

- **No `integrate claude-code`, no Cursor/shell integration, no `ANTHROPIC_BASE_URL` swap.** Earlier versions of this CLI routed traffic through a proxy; that mechanism is gone for good, not just moved. Veyr never sits between you and a model provider.
- **No dashboard, no web view.** Everything above is plain terminal output.
- **No `veyr suggestions`.** The full suggestion-engine output only exists in the Mac app's memory and isn't persisted to a file yet — `veyr status`'s recommendations are a narrower, separate feed (budget/model-switch actions) that *is* persisted.
- **No historical spend breakdown (week/month/per-project).** Only today's running total and the current session are exposed in the shared status file today.

## Development

```bash
npm run dev -- status   # run from source with tsx
npm run typecheck
npm run build            # compile to dist/
```
