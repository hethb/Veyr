# Veyr — 2-minute quickstart

Veyr is local: it reads your coding agent's session logs and your codebase from disk, on your machine. No signup, no API key, no base-URL swap. Pick a surface below — or use more than one, they share the same local data.

---

## Path A — macOS menu bar app (recommended)

1. **Download** `Veyr-0.2.1.dmg` from the [Veyr download page](https://veyr.dev#download)
2. **Install** — open the DMG, drag Veyr to Applications, open it
3. **Bypass Gatekeeper** (required — builds are not yet notarized):
   ```bash
   xattr -cr /Applications/Veyr.app
   ```
4. **Start a Claude Code session** — Veyr detects it automatically and shows today's spend in the menu bar with a pulsing dot while a session is active

Build from source instead (requires Swift 6 CLT + Xcode 16+):
```bash
cd packages/desktop-mac
./Scripts/package_app.sh release && open Veyr.app
```

---

## Path B — VS Code extension

1. **Download** `veyr-vscode-0.2.1.vsix` from the [Veyr download page](https://veyr.dev#download)
2. **Install** — VS Code → Extensions panel (`Cmd+Shift+X`) → `···` → **Install from VSIX…** → select the file
3. The extension activates automatically. Live session cost shows in the status bar; the Veyr sidebar panel shows burn rate, cache hit rate, codebase graph status, and one-click optimization commands

> The Mac app must be running — it writes the local agent feed the VS Code extension reads.

---

## Path C — CLI

```bash
npm install -g getcanopy   # or: npx getcanopy init

veyr status                # today/week/month spend, read from local session logs
veyr suggestions           # optimization tips with ready-to-run commands
```

`veyr init` walks you through setup — no account to create, no key to copy.

---

## What you get, day one

- Real-time spend by project, read straight from Claude Code / Codex CLI session logs — nothing sent anywhere
- Per-project budget caps with local notifications at 80% and 100%
- A `CLAUDE.md` block Claude Code reads every session: current spend, budget status, codebase graph summary
- Graphify-powered codebase graph (needs Python 3.10+, installed automatically on first launch — see the README)

See the [README](./README.md) for the full feature list and [ROADMAP.md](./ROADMAP.md) for what's next.
