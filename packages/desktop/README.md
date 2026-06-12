# Canopy Desktop

A native desktop app (Electron, TypeScript) that gives you the full Canopy
experience with **zero terminals**:

- **Auto-starts the proxy** — reuses one already running, or forks its own on
  the first free port in `3001`–`3010` (and SIGTERMs it on quit). The active
  URL is written to `~/.promptlens/config.json` so the CLI finds it.
- **Opens the dashboard** in a native window (local, single-tenant, no login).
  Closing the window hides to the tray instead of quitting.
- **Menu-bar tray** — live today/month spend (refreshed every 30s), proxy
  status, copy proxy URL / API key, start-at-login toggle, quit.
- **First-run setup** — on first launch (no `~/.promptlens/config.json`) a
  setup window shows your freshly minted demo API key and a 2-line SDK snippet.
- **Auto-updates** — checks GitHub Releases when packaged; failures are
  silent and can never crash the app.

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
npm start --workspace=@promptlens/desktop            # tsc + launch
```

## Build installers

```bash
npm run dist:mac --workspace=@promptlens/desktop     # dmg + zip (x64 + arm64)
npm run dist:win --workspace=@promptlens/desktop     # nsis (x64)
npm run dist:linux --workspace=@promptlens/desktop   # AppImage + deb (x64)
```

Config lives in [electron-builder.yml](electron-builder.yml). The icons in
`assets/` are generated placeholders (`npm run icons`) — **replace them with
real artwork before publishing**, and set the real GitHub owner in the
`publish` block for auto-updates.

> Packaged builds copy the proxy and dashboard builds into `resources/` and
> ship the proxy's runtime deps in the app's `node_modules` (asar is disabled
> for this). Packaged-build smoke testing on each OS is still recommended.

## Seeding demo data

The app shows whatever is in the local SQLite DB. To populate it with demo
traffic first:

```bash
npm run seed -- --reset
```

## Notes

- Ports: the dashboard static server runs on `5273` (override with
  `PROMPTLENS_UI_PORT`); the proxy gets the first free port from `3001`.
- The spawned proxy stores its SQLite DB at `~/.promptlens/data.db`
  (`PROMPTLENS_DB_PATH`); a dev proxy you start yourself keeps using the
  repo-local DB.
- Extra env vars for the spawned proxy can be set in the `proxyEnv` map in
  `~/.promptlens/config.json` (defaults include `PROMPTLENS_ALLOW_ANON=true`
  so key-less tools like Claude Code get logged).
