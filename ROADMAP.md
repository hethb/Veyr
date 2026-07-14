# Veyr product roadmap

**Core product:** A local tool that watches your coding agent's session logs and your codebase, then feeds what it learns back to you and to the agent — no proxy, no hosted account, no dashboard.

```
Claude Code / Codex CLI / etc. logs      Graphify codebase graph
        │                                        │
        ▼                                        ▼
             Veyr (macOS app · VS Code extension · CLI)
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
  spend & budgets    CLAUDE.md guidance   prompt autocomplete
```

---

## Multi-agent usage visibility (**live**)

**Promise:** "Where is my coding-agent spend actually going?"

- Reads session logs directly from disk — Claude Code (`~/.claude/projects/**/*.jsonl`), Codex CLI, and 50+ other providers — no proxy and no API key required just to see spend
- Menu bar app, VS Code status bar, and CLI (`veyr status`) all read the same local data, so spend is consistent across surfaces
- Per-project and per-session cost, budget caps with local notifications, and a 13-rule optimization engine that surfaces concrete, estimated-dollar savings

---

## Graphify-powered codebase context (**live**, expanding)

**Promise:** "Give the agent — and you — a map of the codebase before it starts guessing."

- On-device AST-based knowledge graph (call graph, dependency chain, critical path, test coverage gaps) via Graphify — tree-sitter parsing, zero LLM calls, nothing leaves the machine
- Graph-aware optimization rules: leaf node on an expensive model, god-node blast-radius warnings, unexplored dependencies, redundant re-reads, test coverage gaps on high-connectivity code
- *Next:* incremental graph updates on every save, deeper per-symbol impact scoring, richer graph visualization in the menu bar app and VS Code panel

---

## CLAUDE.md-injected guidance (**live**, expanding)

**Promise:** "Tell the agent how to behave, automatically, instead of hoping it infers it."

- Veyr keeps a marker-delimited block in the active project's `CLAUDE.md` with current spend, budget status, and a codebase graph summary, refreshed every session
- *Next:* guidance aimed specifically at reducing hallucination and verbosity — pointing the agent at the graph summary instead of re-exploring the tree, flagging when it's about to touch a high-connectivity symbol, nudging shorter answers when a task is simple
- *Next:* per-project tuning of what gets injected, so the block earns the tokens it costs

---

## Prompt autocomplete (**building now**)

**Promise:** "Suggest the tighter version of what you were about to type."

- Learns an individual's prompting style from accept/reject signal on past suggestions — metadata only by default, no raw prompt text stored unless explicitly opted in
- Combines that learned style with Graphify's understanding of the codebase to suggest more specific, token-efficient phrasing as you type — e.g. naming the right file or symbol instead of describing it
- Ships first as a rules-based linter, then per-user retrieval over accepted rewrites, with a trained ranker only once there's enough labeled data
- Surfaces: VS Code panel first, CLI and menu bar app follow

---

## Positioning

| Tool | What it does |
|------|----------------|
| Helicone / LangSmith | Shows what happened, from a proxy or SDK wrapper |
| **Veyr** | Reads what already happened, locally, then changes what the agent does next |

---

## Surfaces

All three surfaces read the same local data under `~/.veyr/` and ship from this repo — no server-side component required:

- **macOS menu bar app** (`packages/desktop-mac`) — the primary surface: spend, budgets, CLAUDE.md injection, Graphify graph
- **VS Code extension** (`packages/vscode-extension`) — live cost in the status bar and a suggestions panel; reads the Mac app's local agent feed
- **CLI** (`packages/cli`) — `veyr status`, `veyr suggestions`; scriptable and CI-friendly

See [QUICKSTART.md](./QUICKSTART.md).
