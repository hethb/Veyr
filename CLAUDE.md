<!-- veyr:spend-status:begin -->
## Veyr spend status
> Auto-updated by Veyr · 2026-07-21 01:10 · disable in Veyr settings

**Current session:** claude-sonnet-5 · $3.0500/session · $0.0930/min
**Cache hit rate:** 100%

**Recommendations:**
- Run /compact — Session has cost $3.05 so far. Running /compact trims accumulated context before it grows further.

**Agent instructions:** You are currently in a Veyr-monitored session. Session cost so far: $3.05 at $0.093/min on claude-sonnet-5. Cache hit rate is 100% — good. Keep system prompts stable. This session is long and expensive. Run /compact now to compress context and reduce per-turn cost by ~60%. This is a long conversation. Before your next response, consider running /compact to compress context and reduce per-turn cost.
<!-- veyr:spend-status:end -->

<!-- veyr:graph-context:begin -->
## Veyr codebase graph
> Powered by Graphify · Full graph · 2026-07-21 01:10

### Architecture
3280 files, 45511 symbols in 1439 communities. Primary languages: Swift, Rust, TypeScript. Highest-impact code: .logger(), L(), tauri.ts.

### Critical path (highest-impact files)
- **.logger()** (packages/desktop-mac/Sources/CodexBarCore/Logging/CodexBarLog.swift) — 252 connections
- **L()** (packages/desktop-mac/Sources/CodexBar/Localization.swift) — 177 connections
- **tauri.ts** (packages/desktop-windows/apps/desktop-tauri/src/lib/tauri.ts) — 157 connections
- **bridge.ts** (packages/desktop-windows/apps/desktop-tauri/src/types/bridge.ts) — 138 connections
- **UsageFetcher** (packages/desktop-mac/Sources/CodexBarCore/UsageFetcher.swift) — 121 connections

### Token savings
Reading this summary saves ~7600 tokens vs. exploring files manually.
<!-- veyr:graph-context:end -->
