# Veyr for macOS

Native macOS menu bar app for Veyr — live LLM spend tracking read directly from local
coding-agent logs (Claude Code, Codex, and 50+ other providers). All computation is
on-device; nothing leaves your machine.

**Veyr's native Mac app is built on top of [CodexBar](https://github.com/steipete/CodexBar)
by Peter Steinberger (steipete). MIT licensed.** See `LICENSE` (CodexBar's original MIT
license) and `../../ARCHITECTURE_CODEXBAR.md` for an architecture map of the inherited code.

## Requirements

- macOS 14+ (Sonoma)
- Swift 6.2+ (Xcode 16+)

This is a Swift Package Manager project — it is intentionally **not** part of the npm
workspace in the repo root. Build it separately:

## Build & run (development)

```bash
cd packages/desktop-mac
make start          # builds, packages Veyr.app, launches it
# or:
swift build         # compile only
./Scripts/package_app.sh debug   # produce Veyr.app (adhoc-signed)
open ./Veyr.app
```

## Test

```bash
swift test
```

## Release packaging

```bash
./Scripts/package_app.sh release   # adhoc-signed Veyr.app (unsigned distribution)
```

Adhoc-signed builds require users to bypass Gatekeeper once:
`xattr -cr /Applications/Veyr.app`. Signed + notarized distribution requires an Apple
Developer Program membership (planned; not yet enrolled).

## Structure notes

- Internal Swift module names remain `CodexBar*` (`CodexBarCore`, `CodexBar`,
  `CodexBarCLI`, …) to stay mergeable with upstream. Only user-facing identity is
  rebranded: app name "Veyr", bundle ID `com.veyr.mac`, config at
  `~/.config/veyr/config.json`, caches under Veyr-specific paths.
- Veyr-specific features live under `Sources/CodexBar*/Veyr/` namespaces (added in
  later phases). Upstream files are modified as little as possible.
- Veyr user data lives in `~/.veyr/` (feature tags, budgets, agent status feed).

## TODO (rebrand debt)

- Replace CodexBar menu bar icon and `Icon.icns` with Veyr branding.
- Non-English localization catalogs had "CodexBar" replaced with "Veyr" mechanically;
  strings referencing the `codexbar` CLI binary name are unchanged.
- Widget extension still uses CodexBar naming internally.
- Sparkle auto-update feed is disabled (no Veyr appcast yet).
