# CodexBar Architecture Summary

> Reference notes for the Veyr native Mac app sprint. CodexBar is cloned read-only at
> `CodexBar/` (gitignored, never committed, never modified). MIT licensed, by Peter
> Steinberger (steipete). Veyr's native Mac app will be built on top of it with credit.

## What CodexBar is

A macOS 14+ menu bar app (Swift 6.2, SwiftPM, strict concurrency) that surfaces AI
coding-provider usage limits, credits, spend, and reset windows for **56 providers**
(Claude, Codex, Cursor, Copilot, Gemini, …). No Dock icon. One `NSStatusItem` per
provider, or a "Merge Icons" mode with a provider switcher. Ships with a cross-platform
CLI (`codexbar`), a WidgetKit widget, and Sparkle auto-updates.

Scale: **751 Swift files** across 7 targets. This is far larger than a "menu bar app"
suggests — most of the bulk is per-provider auth/fetch strategies and menu UI variants.

## Targets & dependencies (Package.swift)

| Target | Files | Role |
|---|---|---|
| `CodexBarCore` | 401 | Platform-agnostic library: provider descriptors, fetchers, JSONL cost scanners, pricing, config store, keychain/cookie plumbing. Builds on macOS **and Linux**. |
| `CodexBar` | 322 | The macOS menu bar app: AppKit status items, SwiftUI menu cards, settings window, notifications, Sparkle. |
| `CodexBarCLI` | 20 | `codexbar` CLI: `usage`, `cost`, `config`, `diagnose`, `serve` commands over the same core. |
| `CodexBarWidget` | 6 | WidgetKit burn-down widgets. |
| `CodexBarClaudeWatchdog` | 1 | Tiny process supervisor that kills orphaned Claude CLI probe process trees. |
| `CodexBarClaudeWebProbe` | 1 | Helper executable for claude.ai web scraping probes. |
| `CSQLite3` | — | System library shim for SQLite on Linux. |

Dependencies: **Sparkle** (updates), **KeyboardShortcuts**, **Vortex** (confetti),
**SweetCookieKit** (browser cookie extraction, steipete's), **swift-crypto**,
**swift-log**, **Commander** (CLI parsing). All resolved via SPM.

## The pieces the sprint spec asked me to locate

### 1. Where Claude Code JSONL logs are read

`Sources/CodexBarCore/Vendored/CostUsage/` — a vendored, self-contained cost-scanning
subsystem (ccusage-style logic rewritten in Swift):

- **`CostUsageScanner+Claude.swift`** — the heart of it. Enumerates
  `$CLAUDE_CONFIG_DIR/projects`, `~/.config/claude/projects`, and `~/.claude/projects`
  for `*.jsonl`; parses lines where `type == "assistant"` and `message.usage` exists;
  extracts `input_tokens`, `output_tokens`, `cache_read_input_tokens`,
  `cache_creation_input_tokens` (incl. 1-hour ephemeral cache split), model, timestamp,
  `sessionId`, `requestId`. Deduplicates streaming chunks by `messageId:requestId`
  (last chunk wins), reconciles subagent vs parent rows, filters Vertex AI entries by
  `_vrtx_` ID prefix / `model@version` format.
- **`CostUsageJsonl.swift`** — zero-allocation byte-level line scanner with an offset
  parameter, enabling **incremental parsing**: only new bytes of a grown file are
  re-read. Pre-filters lines with a raw-byte `"type":"assistant"` check before JSON
  decoding.
- **`CostUsageCache.swift`** — per-file cache keyed by path with `mtimeMs + size + parsedBytes`;
  unchanged files are skipped entirely. Persisted to disk per provider.
- **`CostUsageScanner+Timestamp.swift`** — fast ISO-8601 day-key extraction.

**Important nuance vs. the sprint spec:** the scanner aggregates by **day × model**,
not by session, and it does **not** read the `cwd` field. Session IDs are captured on
rows but the reporting output (`CostUsageDailyReport`) is daily. Veyr's per-session /
per-project (feature tag) view is genuinely new work — but the row-level data
(`ClaudeUsageRow`) is already there to build on, and `cwd` extraction is a small,
additive change to the same parse loop.

### 2. Where OpenAI Codex usage is read

Same subsystem: `CostUsageScanner+CodexFastJSON.swift`, `+CodexPriority.swift`,
`+CodexTruncatedPrefix.swift`. Reads Codex CLI session logs from `~/.codex/sessions`
(override via `codexSessionsRoot`), with cumulative-totals delta logic (Codex logs
running totals, not per-turn deltas) and an optional SQLite trace DB. Separately,
`Providers/Codex/` handles the *quota/limits* side via OAuth API + web dashboard.

### 3. Where Cursor usage is read

`Sources/CodexBarCore/Providers/Cursor/CursorStatusProbe.swift` +
`CursorProviderDescriptor.swift`. **Not local files** — Cursor usage comes from
cursor.com's API authenticated by browser session cookies (via SweetCookieKit) or a
manual cookie header. There is no local JSONL for Cursor. This changes Phase 1
expectations: Cursor data appears only if the user has a logged-in browser session.

### 4. The provider abstraction

`Sources/CodexBarCore/Providers/ProviderDescriptor.swift`. Not a protocol — a value
struct each provider supplies:

```
ProviderDescriptor {
  id: UsageProvider              // enum case per provider
  metadata: ProviderMetadata     // name, docs URL, cookie order, …
  branding: ProviderBranding     // icons, colors
  tokenCost: ProviderTokenCostConfig   // supportsTokenCost flag
  fetchPlan: ProviderFetchPlan   // async fetch strategy chain
  cli: ProviderCLIConfig
}
```

All 56 are registered in `ProviderDescriptorRegistry` (compile-time exhaustive over
`UsageProvider.allCases`). Adding a Veyr "provider" (e.g. a spend meter) means adding
an enum case + descriptor, or bypassing the registry and composing our own store.

### 5. Menu bar status item

`Sources/CodexBar/StatusItemController.swift` (+ ~39 extension files,
`StatusItemController+*.swift`) — `@MainActor` AppKit controller managing one
`NSStatusItem` per enabled provider (autosave names `codexbar-<provider>`) or a merged
item. Icon is a custom-drawn usage meter; text label is formatted by
`MenuBarDisplayText.swift` (e.g. `5h 42% · W 18%`). This is where Veyr's `$0.84` label
and pulsing active-session dot go.

### 6. "Popover" panel — actually an NSMenu

CodexBar does **not** use `NSPopover`. Clicking the status item opens an **`NSMenu`**
whose items host SwiftUI views:

- `MenuContent.swift` — root SwiftUI view; renders sections/entries from a
  `MenuDescriptor` built per provider.
- `MenuCardView.swift` (+7 variants) — the provider usage card (progress bars, reset
  countdowns, spend lines).
- `StatusItemController+MenuTypes/MenuCardItems/OverviewSubmenus/…` — menu assembly.
- `CostHistoryChartMenuView.swift`, `UsageBreakdownChartMenuView.swift` — Swift Charts
  views already embedded in menus (precedent for Veyr's 7-day spend chart).

**Implication:** the sprint spec's "add a Spend *tab* to the popover" maps to either
(a) new menu sections/submenus in this NSMenu system, or (b) a dedicated Veyr window.
Tabs-in-a-popover don't exist in CodexBar; we'll decide in Phase 1c.

### 7. Where token counts are extracted and displayed

- Extraction: the CostUsage scanner (above) → `CostUsageDailyReport` / `CostUsageTokenSnapshot`.
- Fetch orchestration: `CostUsageFetcher.swift`, `CostUsageScanExecutor.swift` (core);
  `UsageStore+TokenCost.swift` (app) caches per-provider snapshots.
- Display: `MenuCardView+Costs.swift`, `StatusItemController+CostMenuCard.swift`,
  `CostHistoryChartMenuView.swift`; formatting in `UsageFormatter.swift`.
- CLI: `CLICostCommand.swift` (`codexbar cost --provider claude|codex|both`).

### 8. Pricing

`Vendored/CostUsage/CostUsagePricing.swift` + `ModelsDevPricing.swift`. CodexBar
already has a **much better pricing system than the sprint spec's hardcoded table**: it
fetches the live models.dev catalog (cached on disk), supports per-token rates,
cache-read/cache-write (5-min and 1-h ephemeral) rates, tiered above-threshold pricing,
and date-aware repricing, with hardcoded fallbacks. `normalizeClaudeModel()` handles
model-ID prefix matching. Recommendation for Phase 1b: implement `PricingTable.swift`
as specced (it's the contract), but delegate to `CostUsagePricing` when available and
keep the spec's table as the offline fallback.

## Central state & app composition

- `CodexbarApp.swift` — `@main` SwiftUI `App`; builds `SettingsStore`, `UsageFetcher`,
  `UsageStore`, hands them to `AppDelegate`, hosts the `Settings` scene
  (`PreferencesView`) and a hidden keep-alive window.
- `UsageStore.swift` (+19 extensions) — observable central store: per-provider
  snapshots, refresh scheduling, token-cost caches, error states.
- `SettingsStore.swift` (+8 extensions) — user prefs, provider toggles; persists to
  `~/.config/codexbar/config.json` (legacy `~/.codexbar/config.json`).
- `PreferencesView.swift` + `Preferences*Pane.swift` — settings window (General /
  Display / Providers / … tabs). Veyr's Phase 5 settings section slots in here.
- `AppNotifications.swift`, `SessionQuotaNotifications.swift` —
  `UNUserNotificationCenter` plumbing (precedent for Veyr budget alerts).

## Source map (cluster-level)

Per-file notes for all 751 files would be noise; here is every directory with the
per-file detail where it matters to Veyr.

### `Sources/CodexBarCore/` (401 files)

| Area | Files | What it does |
|---|---|---|
| `Vendored/CostUsage/` | 11 | **The subsystem Veyr is built on.** Per-file: `CostUsageScanner.swift` core scan options/types; `+Claude.swift` Claude JSONL parse/cache/reconcile; `+CodexFastJSON.swift` fast-path Codex event parse; `+CodexPriority.swift` priority-tier pricing selection; `+CodexTruncatedPrefix.swift` recovery for truncated logs; `+CacheHelpers.swift` file-usage cache records; `+Timestamp.swift` fast day-key parsing; `CostUsageJsonl.swift` incremental byte-line scanner; `CostUsageCache.swift` mtime/size/offset cache model + IO; `CostUsagePricing.swift` Claude/Codex price math incl. cache tiers; `ModelsDevPricing.swift` live models.dev catalog fetch + disk cache. |
| `Providers/Claude/` | 16+ | Claude *quota* (not cost) sources: OAuth usage API (`ClaudeUsageFetcher`, `ClaudeOAuth/`), claude.ai web cookies (`ClaudeWeb/`), CLI PTY probe (`ClaudeCLISession`, rate-limit gate, artifact cleaner), plan detection, source planning. |
| `Providers/Codex/` | 22 | Codex quota via OAuth + OpenAI web dashboard; account reconciliation, workspace resolution, rate-window normalization. |
| `Providers/Cursor/` | 3 | Cookie-authenticated cursor.com usage/billing probe. |
| `Providers/<52 others>/` | ~200 | One directory per provider following the same descriptor pattern (auth strategy + fetch + models). Not needed for Veyr Phase 1 beyond compiling. |
| `Providers/ProviderDescriptor.swift` & friends | ~15 | Descriptor struct, registry, fetch plans/contexts, metadata, branding, status probes. |
| `Config/` | 5 | `config.json` schema, store, validation, env overrides. |
| `Host/` (`Process`, `PTY`) | ~10 | Subprocess + PTY runners for CLI probes. |
| `Logging/`, `Generated/`, `WebKit/`, `OpenAIWeb/` | ~30 | swift-log bootstrap, generated localization/version, WebKit cookie probes, OpenAI dashboard scraping. |
| Root files | ~60 | Keychain gates/caches, browser cookie import (SweetCookieKit glue), `UsageFetcher.swift` orchestrator, `CostUsageFetcher.swift`, `UsageFormatter.swift`, `TokenAccounts.swift`, `WidgetSnapshot.swift`, misc utilities. |

### `Sources/CodexBar/` (322 files, by cluster)

| Cluster | Files | What it does |
|---|---|---|
| `StatusItemController*` | 40 | Status items, NSMenu building, menu refresh scheduling, animations, provider switcher, memory-pressure cache trimming. |
| `UsageStore*` | 21 | Central observable store + refresh/token-cost/status extensions. |
| `SettingsStore*` | 10 | Preferences state + config persistence. |
| `MenuCardView*` | 8 | Provider usage cards (+ per-provider variants: MiniMax, Kiro, …). |
| `Preferences*` | 14 | Settings window panes and provider detail views. |
| Menu chart views | ~6 | `CostHistoryChartMenuView`, `UsageBreakdownChartMenuView`, `ZaiHourlyUsageChartMenuView`, hover selection. |
| App shell | ~10 | `CodexbarApp`, `AppDelegate`(+ext), `About`, `UpdateChannel`, Sparkle glue. |
| Notifications/overlays | ~6 | Quota notifications, confetti overlay, quota-warning alert overlay. |
| Login runners | ~5 | Cursor/Gemini/etc. interactive login flows. |
| `Resources/` | — | `Icon-classic.icns` + 21 `*.lproj` localization catalogs. |
| Everything else | ~200 | Cookie stores per provider, token stores, small views/utilities. |

### Other targets

- `Sources/CodexBarCLI/` (20) — `CLIEntry` + one file per command (`CLICostCommand` is
  the useful reference: JSON output of the same cost scan Veyr uses).
- `Sources/CodexBarWidget/` (6) — burn-down widget provider + views.
- `Sources/CodexBarClaudeWatchdog/`, `CodexBarClaudeWebProbe/` (1 each) — helper
  executables described above.

## Data flow (cost path, the one Veyr extends)

```
~/.claude/projects/**/*.jsonl      ~/.codex/sessions/**
        │                                  │
        ▼                                  ▼
CostUsageJsonl.scan (incremental, byte-level)
        │
        ▼
CostUsageScanner+Claude / +CodexFastJSON
  parse assistant lines → ClaudeUsageRow / CodexUsageRow
  dedupe by messageId:requestId → price via CostUsagePricing (models.dev)
        │
        ▼
CostUsageCache (per-file mtime/size/offset, persisted per provider)
        │
        ▼
CostUsageDailyReport / CostUsageTokenSnapshot   ←— CostUsageFetcher
        │
        ▼
UsageStore+TokenCost (app cache) → MenuCardView+Costs / CostHistoryChartMenuView
                                 → StatusItemController label
```

Veyr additions hook in at the parse loop (add `cwd` → featureTag, per-session
grouping) and downstream (SessionEntry model, spend UI, VEYR_STATUS.json writer,
suggestion engine, budget caps).

## Key deviations from the sprint spec's assumptions

1. **No popover, no tabs.** UI is NSMenu + SwiftUI menu cards. "Spend tab" needs a
   design decision in Phase 1c: menu sections/submenu vs. a dedicated Veyr window.
2. **Cursor has no local logs.** Cursor usage requires browser-cookie auth; a
   cookie-less user sees no Cursor data. Claude + Codex are the reliable local sources.
3. **Sessions and `cwd` are not currently surfaced.** Rows are day×model aggregates;
   Veyr's per-session/per-project layer is new code on top of `ClaudeUsageRow` (which
   already carries `sessionId`) plus a small parser extension for `cwd`.
4. **Pricing is already best-in-class** (models.dev live catalog, cache tiers, tiered
   thresholds). The spec's `PricingTable.swift` should wrap/fallback, not replace.
5. **The codebase is very large.** Porting = copying the whole SwiftPM package (all 56
   providers come along) and rebranding the app shell. Trimming to 3 providers is
   possible later but risky to do during the initial port; the descriptor registry
   requires all enum cases to have descriptors.
6. **Claude roots**: reader honors `$CLAUDE_CONFIG_DIR`, `~/.config/claude/projects`,
   *and* `~/.claude/projects` — Veyr should preserve all three, not just the spec's
   `~/.claude/projects`.
7. **Config lives at `~/.config/codexbar/config.json`**; Veyr's rebrand should move to
   its own path so it never collides with a user's real CodexBar install (they may run
   both). All Veyr-specific state stays in `~/.veyr/` per the spec.

## License / credit

MIT (see `CodexBar/LICENSE`). Credit line for Veyr README:
"Veyr's native Mac app is built on top of CodexBar by Peter Steinberger (steipete). MIT licensed."
