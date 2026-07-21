<!-- veyr:spend-status:begin -->
## Veyr spend status
> Auto-updated by Veyr · 2026-07-21 11:20 · disable in Veyr settings

**Current session:** claude-sonnet-5 · $9.2300/session · $0.0140/min
**Cache hit rate:** 100%

**Recommendations:**
- Run /compact — Session has cost $9.23 so far. Running /compact trims accumulated context before it grows further.
- set budget cap — One project dominating spend is fine on purpose — set a budget cap in Controls so overruns get flagged automatically.

**Agent instructions:** You are currently in a Veyr-monitored session. Session cost so far: $9.23 at $0.014/min on claude-sonnet-5. Cache hit rate is 100% — good. Keep system prompts stable. This session is long and expensive. Run /compact now to compress context and reduce per-turn cost by ~60%. This is a long conversation. Before your next response, consider running /compact to compress context and reduce per-turn cost.
<!-- veyr:spend-status:end -->

<!-- veyr:graph-context:begin -->
## Veyr codebase graph
> Powered by Graphify · Full graph · 2026-07-21 11:20

### Architecture
58 files, 425 symbols in 27 communities. Primary languages: TypeScript, JavaScript. Highest-impact code: api.ts, Landing.tsx, Dashboard.tsx.

### Active context: Layout.tsx (src/components/Layout.tsx:1)
**Imports:** VeyrMark.tsx, VeyrMark(), VeyrWordmark(), auth.ts, signOut()
**Imported by:** App.tsx

### Critical path (highest-impact files)
- **api.ts** (src/lib/api.ts) — 64 connections
- **Landing.tsx** (src/pages/Landing.tsx) — 32 connections
- **Dashboard.tsx** (src/pages/Dashboard.tsx) — 31 connections
- **CachePanel.tsx** (src/components/CachePanel.tsx) — 25 connections
- **Graph.tsx** (src/pages/Graph.tsx) — 23 connections

### Token savings
Reading this summary saves ~3600 tokens vs. exploring files manually.
<!-- veyr:graph-context:end -->
