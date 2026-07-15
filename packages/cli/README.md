# getcanopy — the Veyr CLI

Veyr's terminal surface: usage/cost, Graphify graph status, and the CLAUDE.md
agent-guidance rule set. A thin client of the daemon the Veyr menu bar app
hosts on `127.0.0.1` while it's running, falling back to the same local
`~/.veyr/` files it writes when the daemon isn't reachable. No proxy, no
account — the only network calls this CLI makes are loopback, to a process
on this machine; it never sends or intercepts a request/response with a
model provider.

## Install

```bash
npm install -g getcanopy
```

## How it works

The Veyr menu bar app is the only thing that keeps Veyr's data fresh — it
scans your coding-agent session logs, builds the Graphify graph, and (while
running) hosts a small local HTTP server on an OS-assigned port, publishing
that port via `~/.veyr/daemon.json`. It also still rewrites the flat files
(`~/.veyr/agent-status/VEYR_STATUS.json`, `~/.veyr/cache/graph.json`) every
30s while a session is active (every 5 minutes when idle).

`veyr status` and `veyr graph` prefer the daemon — it reflects state a tick
or two fresher than the file cache — and transparently fall back to reading
the flat files when the daemon isn't running. **You don't need to do
anything for this fallback**; the CLI tells you plainly when data is stale
or missing rather than showing stale numbers silently.

`veyr graph --refresh` is the one command that *requires* the daemon: an
on-demand Graphify rescan needs live computation, not just a read. If the
menu bar app isn't already running, this launches it headlessly (no window,
no Dock icon) and waits for it to come up before requesting the rescan.

`veyr rules` is deliberately file-only, not daemon-backed: rule/gate changes
are just config, so they write straight to `~/.veyr/guidance-rules.json` and
`~/.veyr/config.json` and take effect on the Mac app's next tick (≤5
minutes), the same as before the daemon existed.

## Commands

| Command | What it does |
|---|---|
| `veyr status` | Current session cost, today's spend, budget, alerts, recommendations |
| `veyr status --watch` | Same, polling every 3s and re-rendering on change (not a live stream — see below) |
| `veyr status --json` | Raw status payload |
| `veyr graph` | Graphify graph status for whichever workspace Veyr last built |
| `veyr graph --refresh` | Trigger an on-demand rescan of the current directory (launches Veyr headlessly if needed) |
| `veyr graph --top <n>` | Show more/fewer top-connected nodes (default 10) |
| `veyr graph --json` | Raw graph cache payload |
| `veyr rules list` | The agent-guidance rule set and whether injection is on |
| `veyr rules enable <id>` / `disable <id>` | Toggle one rule |
| `veyr rules on` / `off` | Toggle the whole `## Veyr agent guidance` CLAUDE.md section (default off) |

## What this CLI intentionally does not do

- **No `integrate claude-code`, no Cursor/shell integration, no `ANTHROPIC_BASE_URL` swap.** Earlier versions of this CLI routed traffic through a proxy; that mechanism is gone for good, not just moved. Veyr never sits between you and a model provider.
- **No dashboard, no web view.** Everything above is plain terminal output.
- **No `veyr suggestions`.** The full suggestion-engine output only exists in the Mac app's memory and isn't persisted to a file yet — `veyr status`'s recommendations are a narrower, separate feed (budget/model-switch actions) that *is* persisted.
- **No historical spend breakdown (week/month/per-project).** Only today's running total and the current session are exposed in the shared status feed today.

## Development

```bash
npm run dev -- status   # run from source with tsx
npm run typecheck
npm run build            # compile to dist/
```
