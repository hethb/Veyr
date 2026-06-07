// PromptLens desktop app (Electron).
//
// One-click local experience:
//   1. Serves the built dashboard from a tiny static server (SPA fallback).
//   2. Ensures the proxy is running (reuses one on :3001, or spawns its own).
//   3. Opens the dashboard in a native window.
//   4. Shows today's spend in the menu-bar tray.

const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const { readFile, existsSync } = require("node:fs");
const { join, resolve, extname, normalize } = require("node:path");

const PROXY_PORT = Number(process.env.PROMPTLENS_PROXY_PORT || 3001);
const STATIC_PORT = Number(process.env.PROMPTLENS_UI_PORT || 5273);
const PROXY_BASE = `http://localhost:${PROXY_PORT}`;
const UI_ORIGIN = `http://localhost:${STATIC_PORT}`;

const DASHBOARD_DIST = resolve(__dirname, "..", "dashboard", "dist");
const PROXY_ENTRY = resolve(__dirname, "..", "proxy", "dist", "index.js");

let mainWindow = null;
let tray = null;
let proxyChild = null; // set only if we spawned it
let spendTimer = null;

// ---------------------------------------------------------------------------
// Tiny static file server for the built dashboard (with SPA fallback)
// ---------------------------------------------------------------------------
const MIME = {
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

// Backend route prefixes are reverse-proxied to the proxy on :3001 so the
// dashboard talks to the same origin it was served from — no CORS at all.
const PROXY_PREFIXES = ["/api", "/openai", "/anthropic", "/health"];

function proxyToBackend(req, res) {
  const upstream = http.request(
    {
      hostname: "localhost",
      port: PROXY_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${PROXY_PORT}` },
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

function startStaticServer() {
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
        res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
        res.end(data);
      });
    });
    server.listen(STATIC_PORT, () => resolveServer(server));
  });
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function httpGetJson(url, timeoutMs = 2000) {
  return new Promise((resolveReq) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolveReq(JSON.parse(body));
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForProxy(attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    const health = await httpGetJson(`${PROXY_BASE}/health`);
    if (health && health.status === "ok") return true;
    await sleep(500);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Proxy lifecycle
// ---------------------------------------------------------------------------
async function ensureProxy() {
  // Reuse an already-running PromptLens proxy if present.
  const existing = await httpGetJson(`${PROXY_BASE}/health`);
  if (existing && existing.status === "ok") return true;

  if (!existsSync(PROXY_ENTRY)) {
    dialog.showErrorBox(
      "PromptLens",
      `Proxy build not found at:\n${PROXY_ENTRY}\n\nRun "npm run build:deps" in packages/desktop first.`
    );
    return false;
  }

  proxyChild = spawn(process.env.PROMPTLENS_NODE || "node", [PROXY_ENTRY], {
    env: {
      ...process.env,
      PORT: String(PROXY_PORT),
      NODE_ENV: "production",
      // Guarantee CORS works for our UI origin regardless of any .env value.
      DASHBOARD_ORIGIN: UI_ORIGIN,
    },
    stdio: "inherit",
  });
  proxyChild.on("exit", (code) => {
    proxyChild = null;
    if (code && code !== 0) {
      console.error(`[desktop] proxy exited with code ${code}`);
    }
  });

  return waitForProxy();
}

// ---------------------------------------------------------------------------
// Window + tray
// ---------------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    backgroundColor: "#000000",
    title: "PromptLens",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(`${UI_ORIGIN}/dashboard`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function fmtUsd(n) {
  const v = typeof n === "number" ? n : 0;
  return `$${v.toFixed(2)}`;
}

function createTray() {
  // Empty image + title text — avoids shipping a binary icon. On macOS this
  // shows the text in the menu bar.
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("PromptLens");
  tray.setTitle(" PromptLens");
  const menu = Menu.buildFromTemplate([
    { label: "Open dashboard", click: showWindow },
    { label: "Refresh spend", click: updateSpend },
    { type: "separator" },
    { label: "Quit PromptLens", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on("click", showWindow);
}

async function updateSpend() {
  if (!tray) return;
  const overview = await httpGetJson(`${PROXY_BASE}/api/stats/overview`);
  if (overview && overview.today) {
    tray.setTitle(` ${fmtUsd(overview.today.cost)} today`);
    tray.setToolTip(
      `PromptLens — today ${fmtUsd(overview.today.cost)} · month ${fmtUsd(overview.month?.cost)}`
    );
  } else {
    tray.setTitle(" PromptLens");
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

  await startStaticServer();
  createTray();
  updateSpend();

  const ready = await ensureProxy();
  if (!ready) {
    dialog.showErrorBox(
      "PromptLens",
      "Couldn't start the PromptLens proxy. Check that port 3001 is free, then reopen the app."
    );
  }

  createWindow();
  spendTimer = setInterval(updateSpend, 30000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Tray app: stay alive when the window is closed (except when quitting).
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Keep running in the tray on all platforms; do nothing here.
  }
});

app.on("before-quit", () => {
  if (spendTimer) clearInterval(spendTimer);
  if (proxyChild) {
    proxyChild.kill();
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
