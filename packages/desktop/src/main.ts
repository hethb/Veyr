// PromptLens desktop app (Electron).
//
// One-click local experience:
//   1. Serves the built dashboard from a tiny static server (SPA fallback).
//   2. Ensures the proxy is running (reuses one on :3001, or forks its own on
//      the first free port in 3001-3010).
//   3. Opens the dashboard in a native window; closing it hides to the tray.
//   4. Tray shows live spend, proxy status, copy actions, start-at-login.
//   5. First launch (no ~/.promptlens/config.json) shows a setup window with
//      the freshly minted demo API key.

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
} from "electron";
import { fork, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { existsSync, readFile } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { CONFIG_DIR, configExists, loadConfig, saveConfig } from "./config.js";

const STATIC_PORT = Number(process.env.PROMPTLENS_UI_PORT || 5273);
const UI_ORIGIN = `http://localhost:${STATIC_PORT}`;
const PROXY_PORT_MIN = 3001;
const PROXY_PORT_MAX = 3010;
const PROXY_START_TIMEOUT_MS = 5000;

// In dev these resolve to sibling workspace packages; in a packaged app the
// proxy and dashboard builds are copied into resources/ (see electron-builder.yml).
const DASHBOARD_DIST = app.isPackaged
  ? join(process.resourcesPath, "dashboard")
  : resolve(__dirname, "..", "..", "dashboard", "dist");
const PROXY_ENTRY = app.isPackaged
  ? join(process.resourcesPath, "proxy", "index.js")
  : resolve(__dirname, "..", "..", "proxy", "dist", "index.js");
const SETUP_PAGE = app.isPackaged
  ? join(process.resourcesPath, "setup.html")
  : resolve(__dirname, "..", "setup.html");

let mainWindow: BrowserWindow | null = null;
let setupWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let proxyChild: ChildProcess | null = null; // set only if we spawned it
let spendTimer: NodeJS.Timeout | null = null;
let activeProxyPort = PROXY_PORT_MIN;
let isQuitting = false;

const proxyBase = (): string => `http://localhost:${activeProxyPort}`;

// ---------------------------------------------------------------------------
// Tiny static file server for the built dashboard (with SPA fallback)
// ---------------------------------------------------------------------------
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json",
};

// Backend route prefixes are reverse-proxied to the proxy so the dashboard
// talks to the same origin it was served from — no CORS at all.
const PROXY_PREFIXES = ["/api", "/openai", "/anthropic", "/health"];

function proxyToBackend(req: http.IncomingMessage, res: http.ServerResponse): void {
  const upstream = http.request(
    {
      hostname: "localhost",
      port: activeProxyPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${activeProxyPort}` },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    }
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Proxy unavailable" }));
  });
  req.pipe(upstream);
}

function startStaticServer(): Promise<http.Server> {
  return new Promise((resolveServer) => {
    const server = http.createServer((req, res) => {
      const rawPath = (req.url || "/").split("?")[0];
      if (PROXY_PREFIXES.some((p) => rawPath === p || rawPath.startsWith(`${p}/`))) {
        proxyToBackend(req, res);
        return;
      }

      const urlPath = decodeURIComponent(rawPath);
      // Resolve within DASHBOARD_DIST; fall back to index.html for SPA routes.
      let filePath = normalize(join(DASHBOARD_DIST, urlPath));
      if (!filePath.startsWith(DASHBOARD_DIST)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const isFile = extname(filePath) !== "" && existsSync(filePath);
      if (!isFile) filePath = join(DASHBOARD_DIST, "index.html");

      readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": MIME[extname(filePath)] || "application/octet-stream",
        });
        res.end(data);
      });
    });
    server.listen(STATIC_PORT, () => resolveServer(server));
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function httpGetJson<T = unknown>(url: string, timeoutMs = 2000): Promise<T | null> {
  return new Promise((resolveReq) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolveReq(JSON.parse(body) as T);
          } catch {
            resolveReq(null);
          }
        } else {
          resolveReq(null);
        }
      });
    });
    req.on("error", () => resolveReq(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolveReq(null);
    });
  });
}

function httpPostJson<T = unknown>(
  url: string,
  payload: unknown,
  timeoutMs = 5000
): Promise<T | null> {
  return new Promise((resolveReq) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolveReq(JSON.parse(data) as T);
            } catch {
              resolveReq(null);
            }
          } else {
            resolveReq(null);
          }
        });
      }
    );
    req.on("error", () => resolveReq(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolveReq(null);
    });
    req.write(body);
    req.end();
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface HealthResponse {
  status?: string;
}

async function isPromptLensAt(port: number): Promise<boolean> {
  const health = await httpGetJson<HealthResponse>(`http://localhost:${port}/health`, 1000);
  return health?.status === "ok";
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const probe = net
      .createServer()
      .once("error", () => resolvePort(false))
      .once("listening", () => probe.close(() => resolvePort(true)))
      .listen(port, "127.0.0.1");
  });
}

// ---------------------------------------------------------------------------
// Proxy lifecycle
// ---------------------------------------------------------------------------
async function ensureProxy(): Promise<boolean> {
  const config = loadConfig();

  for (let port = PROXY_PORT_MIN; port <= PROXY_PORT_MAX; port++) {
    // Reuse an already-running PromptLens proxy if present.
    if (await isPromptLensAt(port)) {
      activeProxyPort = port;
      saveConfig({ proxyUrl: proxyBase() });
      return true;
    }
    if (!(await isPortFree(port))) continue; // occupied by something else

    if (!existsSync(PROXY_ENTRY)) {
      dialog.showErrorBox(
        "PromptLens",
        `Proxy build not found at:\n${PROXY_ENTRY}\n\nRun "npm run build:deps" in packages/desktop first.`
      );
      return false;
    }

    proxyChild = fork(PROXY_ENTRY, [], {
      env: {
        ...process.env,
        ...config.proxyEnv,
        PORT: String(port),
        NODE_ENV: "production",
        // Keep the SQLite store in the user's home dir, not the install dir.
        PROMPTLENS_DB_PATH: join(CONFIG_DIR, "data.db"),
        // Guarantee CORS works for our UI origin regardless of any .env value.
        DASHBOARD_ORIGIN: UI_ORIGIN,
        // Let the forked proxy resolve its deps from the packaged app.
        NODE_PATH: join(app.getAppPath(), "node_modules"),
      },
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    proxyChild.on("exit", (code) => {
      proxyChild = null;
      if (code && code !== 0) {
        console.error(`[desktop] proxy exited with code ${code}`);
      }
    });

    const deadline = Date.now() + PROXY_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await isPromptLensAt(port)) {
        activeProxyPort = port;
        saveConfig({ proxyUrl: proxyBase() });
        return true;
      }
      await sleep(250);
    }

    dialog.showErrorBox(
      "PromptLens",
      `The PromptLens proxy did not start within ${PROXY_START_TIMEOUT_MS / 1000} seconds on port ${port}.\n\nCheck the logs and reopen the app.`
    );
    return false;
  }

  dialog.showErrorBox(
    "PromptLens",
    `No free port found in ${PROXY_PORT_MIN}-${PROXY_PORT_MAX} for the PromptLens proxy.`
  );
  return false;
}

interface CreatedKey {
  key?: string;
}

/** Mints a demo API key on first run and persists it for the tray/CLI. */
async function ensureApiKey(): Promise<string | null> {
  const config = loadConfig();
  if (config.apiKey) return config.apiKey;

  const created = await httpPostJson<CreatedKey>(`${proxyBase()}/api/keys`, {
    name: "Desktop demo key",
  });
  if (created?.key) {
    saveConfig({ apiKey: created.key });
    return created.key;
  }
  console.error("[desktop] could not mint a demo API key");
  return null;
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    backgroundColor: "#000000",
    title: "PromptLens",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(`${UI_ORIGIN}/dashboard`);
  // Hide to tray instead of quitting (standard mac tray-app behavior).
  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
      if (process.platform === "darwin") app.dock?.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showWindow(): void {
  if (process.platform === "darwin") app.dock?.show();
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function showSetupWindow(apiKey: string | null): void {
  setupWindow = new BrowserWindow({
    width: 640,
    height: 560,
    resizable: false,
    title: "Welcome to PromptLens",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  setupWindow.loadFile(SETUP_PAGE, {
    query: { key: apiKey ?? "", url: proxyBase() },
  });
  // The page's "Open Dashboard" button calls window.close(); we then open the
  // main window.
  setupWindow.on("closed", () => {
    setupWindow = null;
    showWindow();
  });
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function fmtUsd(n: unknown): string {
  const v = typeof n === "number" ? n : 0;
  return v > 0 && v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}

interface OverviewBucket {
  cost: number;
  requests: number;
  tokens: number;
}
interface Overview {
  today?: OverviewBucket;
  week?: OverviewBucket;
  month?: OverviewBucket;
}

function buildTrayMenu(overview: Overview | null, healthy: boolean): Menu {
  const config = loadConfig();
  return Menu.buildFromTemplate([
    { label: "PromptLens", enabled: false },
    { type: "separator" },
    { label: `Today: ${fmtUsd(overview?.today?.cost)}`, enabled: false },
    { label: `This month: ${fmtUsd(overview?.month?.cost)}`, enabled: false },
    { type: "separator" },
    { label: "Open Dashboard", click: showWindow },
    { type: "separator" },
    {
      label: healthy
        ? `Proxy status: 🟢 Running on :${activeProxyPort}`
        : "Proxy status: 🔴 Unreachable",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Copy proxy URL",
      click: () => clipboard.writeText(proxyBase()),
    },
    {
      label: "Copy API key",
      enabled: Boolean(config.apiKey),
      click: () => {
        const key = loadConfig().apiKey;
        if (key) clipboard.writeText(key);
      },
    },
    { type: "separator" },
    {
      label: "Start at login",
      type: "checkbox",
      checked: config.openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
        saveConfig({ openAtLogin: item.checked });
      },
    },
    { type: "separator" },
    {
      label: "Quit PromptLens",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray(): void {
  // Empty image + title text — avoids shipping a binary icon. On macOS this
  // shows the text in the menu bar.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("PromptLens");
  tray.setTitle(" PromptLens");
  tray.setContextMenu(buildTrayMenu(null, false));
}

async function updateTray(): Promise<void> {
  if (!tray) return;
  const healthy = await isPromptLensAt(activeProxyPort);
  const overview = healthy
    ? await httpGetJson<Overview>(`${proxyBase()}/api/stats/overview`)
    : null;

  if (overview?.today) {
    tray.setTitle(` ${fmtUsd(overview.today.cost)} today`);
    tray.setToolTip(
      `PromptLens — today ${fmtUsd(overview.today.cost)} · month ${fmtUsd(overview.month?.cost)}`
    );
  } else {
    tray.setTitle(" PromptLens");
    tray.setToolTip("PromptLens");
  }
  tray.setContextMenu(buildTrayMenu(overview, healthy));
}

// ---------------------------------------------------------------------------
// Auto-updater — must fail silently, never crash the app.
// ---------------------------------------------------------------------------
function setupAutoUpdater(): void {
  if (!app.isPackaged) return; // dev runs have no update feed
  try {
    // Lazy-require so a missing/broken module can never break startup.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require("electron-updater") as typeof import("electron-updater");

    autoUpdater.on("update-available", () => {
      try {
        new Notification({
          title: "PromptLens",
          body: "A PromptLens update is available and will install on next launch.",
        }).show();
      } catch (err) {
        console.error("Auto-updater notification error:", err);
      }
    });
    autoUpdater.on("error", (err) => {
      console.error("Auto-updater error:", err);
      // Fail silently — never crash the app due to update check failure.
    });

    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error("Auto-updater check failed:", err);
    });
  } catch (err) {
    console.error("Auto-updater init failed:", err);
  }
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(async () => {
  if (!existsSync(DASHBOARD_DIST)) {
    dialog.showErrorBox(
      "PromptLens",
      `Dashboard build not found at:\n${DASHBOARD_DIST}\n\nRun "npm run build:deps" in packages/desktop first.`
    );
    app.quit();
    return;
  }

  // Detect first run before anything writes the config file.
  const firstRun = !configExists();

  await startStaticServer();
  createTray();

  const ready = await ensureProxy();
  const apiKey = ready ? await ensureApiKey() : null;

  // Apply persisted login-item preference.
  app.setLoginItemSettings({ openAtLogin: loadConfig().openAtLogin });

  if (firstRun && ready) {
    showSetupWindow(apiKey);
  } else {
    createWindow();
  }

  updateTray();
  spendTimer = setInterval(updateTray, 30000);
  setupAutoUpdater();

  app.on("activate", () => {
    showWindow();
  });
});

// Tray app: stay alive when the window is closed (except when quitting).
app.on("window-all-closed", () => {
  // Keep running in the tray on all platforms; do nothing here.
});

app.on("before-quit", () => {
  isQuitting = true;
  if (spendTimer) clearInterval(spendTimer);
  if (proxyChild) {
    proxyChild.kill("SIGTERM");
    proxyChild = null;
  }
});

// Open external links in the system browser, not a new Electron window.
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});
