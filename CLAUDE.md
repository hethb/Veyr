<!-- veyr:spend-status:begin -->
## Veyr spend status
> Auto-updated by Veyr · 2026-07-24 15:45 · disable in Veyr settings

**Current session:** claude-sonnet-5 · $0.1100/session · $0.0000/min
**Cache hit rate:** 100%

**Recommendations:**
- use graph context — Your agent re-reads 13 stable files across Veyr sessions. The Graphify summary in CLAUDE.md / VEYR_STATUS.json covers them — point the agent at the graph summary instead.

**Agent instructions:** You are currently in a Veyr-monitored session. Session cost so far: $0.11 at $0.000/min on claude-sonnet-5. Cache hit rate is 100% — good. Keep system prompts stable. You currently have 11 tools available in this project but use ~2 on average. Request only the tools relevant to the current subtask. This is a long conversation. Before your next response, consider running /compact to compress context and reduce per-turn cost.
<!-- veyr:spend-status:end -->

<!-- veyr:graph-context:begin -->
## Veyr codebase graph
> Powered by Graphify · Full graph · 2026-07-24 15:45

### Architecture
3288 files, 45589 symbols in 1412 communities. Primary languages: Swift, Rust, TypeScript. Highest-impact code: .logger(), L(), tauri.ts.

### Active context: IntroReveal.tsx (packages/dashboard/src/components/IntroReveal.tsx:1)
**Imported by:** Landing.tsx

### Critical path (highest-impact files)
- **.logger()** (packages/desktop-mac/Sources/CodexBarCore/Logging/CodexBarLog.swift) — 252 connections
- **L()** (packages/desktop-mac/Sources/CodexBar/Localization.swift) — 177 connections
- **tauri.ts** (packages/desktop-windows/apps/desktop-tauri/src/lib/tauri.ts) — 157 connections
- **bridge.ts** (packages/desktop-windows/apps/desktop-tauri/src/types/bridge.ts) — 138 connections
- **UsageFetcher** (packages/desktop-mac/Sources/CodexBarCore/UsageFetcher.swift) — 121 connections

### Token savings
Reading this summary saves ~7600 tokens vs. exploring files manually.
<!-- veyr:graph-context:end -->
