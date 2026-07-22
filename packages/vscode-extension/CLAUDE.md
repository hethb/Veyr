<!-- veyr:spend-status:begin -->
## Veyr spend status
> Auto-updated by Veyr · 2026-07-21 22:44 · disable in Veyr settings

**Current session:** claude-fable-5 · $31.0800/session · $0.1300/min
**Cache hit rate:** 100%

**Recommendations:**
- Run /compact — Session is burning $0.13/minute. Running /compact now reduces per-turn input cost by cutting accumulated context.
- set budget cap — One project dominating spend is fine on purpose — set a budget cap in Controls so overruns get flagged automatically.

**Agent instructions:** You are currently in a Veyr-monitored session. Session cost so far: $31.08 at $0.130/min on claude-fable-5. Cache hit rate is 100% — good. Keep system prompts stable. This session is long and expensive. Run /compact now to compress context and reduce per-turn cost by ~60%. This is a long conversation. Before your next response, consider running /compact to compress context and reduce per-turn cost.
<!-- veyr:spend-status:end -->

<!-- veyr:graph-context:begin -->
## Veyr codebase graph
> Powered by Graphify · Full graph · 2026-07-21 22:44

### Architecture
3287 files, 45576 symbols in 1403 communities. Primary languages: Swift, Rust, TypeScript. Highest-impact code: .logger(), L(), tauri.ts.

### Active context: tsconfig.json (packages/vscode-extension/tsconfig.json:1)

### Critical path (highest-impact files)
- **.logger()** (packages/desktop-mac/Sources/CodexBarCore/Logging/CodexBarLog.swift) — 252 connections
- **L()** (packages/desktop-mac/Sources/CodexBar/Localization.swift) — 177 connections
- **tauri.ts** (packages/desktop-windows/apps/desktop-tauri/src/lib/tauri.ts) — 157 connections
- **bridge.ts** (packages/desktop-windows/apps/desktop-tauri/src/types/bridge.ts) — 138 connections
- **UsageFetcher** (packages/desktop-mac/Sources/CodexBarCore/UsageFetcher.swift) — 121 connections

### Token savings
Reading this summary saves ~7600 tokens vs. exploring files manually.
<!-- veyr:graph-context:end -->
