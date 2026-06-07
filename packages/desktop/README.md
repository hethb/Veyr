# PromptLens Desktop

A native desktop app (Electron) that gives you the full PromptLens experience
with **zero terminals**:

- **Auto-starts the proxy** — reuses one already running on `:3001`, or spawns
  its own as a background process (and shuts it down on quit).
- **Opens the dashboard** in a native window (local, single-tenant, no login).
- **Menu-bar tray** showing today's spend, refreshed every 30s, with quick
  actions (Open dashboard / Refresh / Quit).

## Run it

From the repo root:

```bash
npm install
npm run desktop
```

`npm run desktop` builds the proxy + dashboard, then launches the app. After the
first build you can iterate faster with:

```bash
npm run build:deps --workspace=@promptlens/desktop   # rebuild proxy + dashboard
npm start --workspace=@promptlens/desktop            # launch without rebuilding
```

## Seeding demo data

The app shows whatever is in your local SQLite DB. To populate it with demo
traffic first:

```bash
npm run seed -- --reset
```

## Notes

- Ports: the proxy runs on `3001` and the bundled dashboard is served on `5273`
  (override with `PROMPTLENS_PROXY_PORT` / `PROMPTLENS_UI_PORT`).
- The app spawns the proxy with the system `node` (set `PROMPTLENS_NODE` to use a
  specific binary). This avoids native-module ABI issues with `better-sqlite3`.
- Packaging a distributable `.app`/`.exe` (via `electron-builder`) isn't wired up
  yet — this runs in dev mode. Ask if you want installers built.
