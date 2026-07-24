<!-- veyr:spend-status:begin -->
## Veyr spend status
> Auto-updated by Veyr · 2026-07-24 00:13 · disable in Veyr settings

**Current session:** claude-fable-5 · $12.3800/session · $0.0140/min
**Cache hit rate:** 100%

**Recommendations:**
- Run /compact — Session has cost $12.38 so far. Running /compact trims accumulated context before it grows further.
- use graph context — Your agent re-reads 4 stable files across cli sessions. The Graphify summary in CLAUDE.md / VEYR_STATUS.json covers them — point the agent at the graph summary instead.

**Agent instructions:** You are currently in a Veyr-monitored session. Session cost so far: $12.38 at $0.014/min on claude-fable-5. Cache hit rate is 100% — good. Keep system prompts stable. This session is long and expensive. Run /compact now to compress context and reduce per-turn cost by ~60%. This is a long conversation. Before your next response, consider running /compact to compress context and reduce per-turn cost.
<!-- veyr:spend-status:end -->

<!-- veyr:graph-context:begin -->
## Veyr codebase graph
> Powered by Graphify · Full graph · 2026-07-24 00:13

### Architecture
3288 files, 45585 symbols in 1437 communities. Primary languages: Swift, Rust, TypeScript. Highest-impact code: .logger(), L(), tauri.ts.

### Active context: dashboard.ts (packages/cli/src/commands/dashboard.ts:1)
**Imports:** ui.ts, divider(), fmtAge(), fmtTokens(), fmtUsd()
**Imported by:** index.ts

### Critical path (highest-impact files)
- **.logger()** (packages/desktop-mac/Sources/CodexBarCore/Logging/CodexBarLog.swift) — 252 connections
- **L()** (packages/desktop-mac/Sources/CodexBar/Localization.swift) — 177 connections
- **tauri.ts** (packages/desktop-windows/apps/desktop-tauri/src/lib/tauri.ts) — 157 connections
- **bridge.ts** (packages/desktop-windows/apps/desktop-tauri/src/types/bridge.ts) — 138 connections
- **UsageFetcher** (packages/desktop-mac/Sources/CodexBarCore/UsageFetcher.swift) — 121 connections

### Token savings
Reading this summary saves ~7600 tokens vs. exploring files manually.
<!-- veyr:graph-context:end -->
