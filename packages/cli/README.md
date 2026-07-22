# getcanopy — the Veyr CLI

Veyr's terminal surface: usage/cost, Graphify graph status, and the CLAUDE.md
agent-guidance rule set. **Fully standalone** — the CLI scans your
coding-agent session logs, prices sessions, and builds the codebase graph
itself, so you can `npm install -g getcanopy` and never touch the desktop
app. When the Veyr desktop app *is* installed and running, the CLI prefers
the small daemon it hosts on `127.0.0.1` (slightly fresher data, the app's
fuller pricing pipeline) and both surfaces share the same `~/.veyr/` data.
No proxy, no account — the only routine network calls this CLI makes are
loopback, plus two deliberate exceptions: at most once a day it asks
`registry.npmjs.org` which getcanopy version is latest, so it can tell you
when yours is behind (set `VEYR_NO_UPDATE_CHECK=1` to turn that off), and
the first `veyr graph --refresh` installs Graphify from a pinned, audited
GitHub commit if it isn't already present. It never sends or intercepts a
request/response with a model provider.

## Install

```bash
npm install -g getcanopy
```

## Update

```bash
npm install -g getcanopy@latest
```

You don't need to remember this: when a newer version is on npm, the CLI
prints a one-line nudge with that exact command (checked in the background
once a day, never blocking your command, silent when offline).

## How it works

The CLI is self-sufficient. Every read has a local computation behind it:

- **Sessions/spend** — the CLI scans Claude Code's and Codex CLI's logs
  directly (incrementally — unchanged files are skipped) and prices them
  with a built-in rate table.
- **Status** — `veyr status` derives a snapshot (current session, today's
  spend, cache hit rate) from those same scans.
- **Graph** — `veyr graph --refresh` runs Graphify itself (pure AST, no LLM
  calls, nothing leaves your machine), installing it on first use from a
  pinned commit — `pip --user`, or a private venv at `~/.veyr/graphify-venv`
  when your Python is externally managed. Needs Python 3.10+.

When the Veyr desktop app is installed, it keeps the same data fresh
continuously: it hosts a small local HTTP server on an OS-assigned port
(published via `~/.veyr/daemon.json`) and rewrites the flat files
(`~/.veyr/agent-status/VEYR_STATUS.json`, `~/.veyr/cache/graph.json`) every
30s while a session is active. The CLI prefers that daemon when reachable —
fresher data, the app's fuller pricing pipeline (models.dev catalog),
app-computed alerts/recommendations — and computes locally otherwise. **You
don't need to do anything for this**; every command labels which source
you're seeing. The CLI never launches the app.

`veyr rules` is deliberately file-only, not daemon-backed: rule/gate changes
are just config, so they write straight to `~/.veyr/guidance-rules.json` and
`~/.veyr/config.json`. Note the CLAUDE.md injection itself is performed by
the desktop app's background tick — the CLI edits the shared config either
way, and changes apply within ≤5 minutes while the app runs.

## Commands

Run `veyr` with no arguments for the terminal dashboard — a one-screen
overview (session, usage, graph, savings, rules) that also lists every
command below, so you never need this table to discover one. It renders
once automatically on the CLI's very first run as a welcome/orientation
screen (marker: `~/.veyr/cli.json`; TTY only, never spliced into `--json`
or piped output).

| Command | What it does |
|---|---|
| `veyr` / `veyr dashboard` | Terminal overview: session, usage, graph, savings, rules, command list |
| `veyr status` | Current session cost, today's spend, budget, alerts, tool health, recommendations |
| `veyr status --watch` | Same, polling every 3s and re-rendering on change (not a live stream — see below) |
| `veyr status --json` | Raw status payload |
| `veyr usage` | Per-agent (provider · model) and per-project spend, today/week/month, 7-day bars, session timeline |
| `veyr usage --sessions <n>` | Show more/fewer recent sessions (default 8) |
| `veyr usage --json` | Raw session entries |
| `veyr graph` | Graphify graph status + current understanding (overview, savings estimate, active file) |
| `veyr graph --refresh` | Rescan the current directory — via the app when it's running, otherwise built locally |
| `veyr graph --top <n>` | Show more/fewer top-connected nodes (default 10) |
| `veyr graph --json` | Raw graph cache payload |
| `veyr rules` / `veyr rules list` | The agent-guidance rule set and whether injection is on |
| `veyr rules enable <id>` / `disable <id>` | Toggle one rule |
| `veyr rules on` / `off` | Toggle the whole `## Veyr agent guidance` CLAUDE.md section (default off) |
| `veyr savings` | Estimated savings, lifetime + current project, every figure confidence-tagged |
| `veyr savings --projects` | Savings broken down per project (all time) |
| `veyr savings --detail` | Full per-component breakdown and methodology |
| `veyr savings enable` / `disable` / `status` | Toggle/inspect the savings tracker (default off) |
| `veyr compose` | Compose a prompt interactively with style-based suggestions |
| `veyr style enable` / `disable` / `status` | Toggle/inspect on-device prompt-style learning (default off) |

`veyr usage` prefers the daemon's `/sessions` (rows priced by the app's full
pricing pipeline, models.dev catalog included). When the daemon is
unreachable it scans your agent logs itself and prices them with a built-in
rate table — the output labels which source you're seeing, and
locally-priced figures can differ slightly from the app's.

## What this CLI intentionally does not do

- **No `integrate claude-code`, no Cursor/shell integration, no `ANTHROPIC_BASE_URL` swap.** Earlier versions of this CLI routed traffic through a proxy; that mechanism is gone for good, not just moved. Veyr never sits between you and a model provider.
- **No hosted dashboard, no web view.** Everything above — the `veyr` dashboard included — is plain terminal output; nothing opens a browser or a GUI window.
- **No `veyr suggestions`.** The full suggestion-engine output only exists in the Mac app's memory and isn't persisted to a file yet — `veyr status`'s recommendations are a narrower, separate feed (budget/model-switch actions) that *is* persisted.

## Development

```bash
npm run dev -- status   # run from source with tsx
npm run typecheck
npm run build            # esbuild bundle → dist/ (inlines @veyr/core + deps)
```

## Releasing

Publishing to npm is automated by `.github/workflows/publish-cli.yml`:

```bash
# 1. bump "version" in package.json, commit, push
# 2. tag it — the workflow verifies tag == package.json version, then publishes
git tag cli-v0.3.1 && git push --tags
```

Manual `npm publish` from this directory still works too (`prepublishOnly`
rebuilds the bundle).
