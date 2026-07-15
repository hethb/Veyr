// Client for the daemon Veyr's menu bar app hosts while it's running
// (packages/desktop-mac/Sources/CodexBar/Veyr/VeyrDaemonServer.swift). There
// is no standalone daemon binary — the "daemon" is the always-running menu
// bar app's in-process HTTP server, discovered via ~/.veyr/daemon.json.
//
// Reads (status/graph/rules) prefer the daemon for freshness but always fall
// back to the flat ~/.veyr/ files when it's unreachable — the app not
// running is a normal, expected state, not an error. Only operations that
// need live computation (an on-demand Graphify rescan) call
// ensureDaemonRunning(), which launches the app headlessly (no window, no
// Dock icon) as a last-resort-avoiding fallback before giving up.

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import { promisify } from "node:util";
import { daemonInfoFilePath } from "./paths.js";

const execFileAsync = promisify(execFile);

interface DaemonInfo {
  readonly port: number;
  readonly pid: number;
  readonly startedAt: string;
}

function readDaemonInfo(): DaemonInfo | null {
  let raw: string;
  try {
    raw = fs.readFileSync(daemonInfoFilePath(), "utf8");
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DaemonInfo>;
    return typeof parsed.port === "number" ? (parsed as DaemonInfo) : null;
  } catch {
    return null;
  }
}

function request<T>(
  info: DaemonInfo,
  method: "GET" | "POST",
  path: string,
  timeoutMs: number
): Promise<T | null> {
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port: info.port, path, method, timeout: timeoutMs },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          if (!res.statusCode || res.statusCode >= 400) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

const DEFAULT_TIMEOUT_MS = 300;

/** Best-effort GET against the daemon. Never throws — null means "not running or not reachable", the normal case when the menu bar app is closed. */
export function daemonGet<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T | null> {
  const info = readDaemonInfo();
  if (!info) return Promise.resolve(null);
  return request<T>(info, "GET", path, timeoutMs);
}

/** Best-effort POST against the daemon. Same failure semantics as daemonGet. */
export function daemonPost<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T | null> {
  const info = readDaemonInfo();
  if (!info) return Promise.resolve(null);
  return request<T>(info, "POST", path, timeoutMs);
}

// Release and debug builds register different bundle ids (Scripts/package_app.sh).
const BUNDLE_IDS = ["com.veyr.mac", "com.veyr.mac.debug"];
const LAUNCH_POLL_INTERVAL_MS = 250;
const LAUNCH_TIMEOUT_MS = 10_000;

export type EnsureDaemonResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Ensures the daemon is reachable, launching the Veyr menu bar app headlessly
 * (no window, no Dock icon — `open -g -j`) if it isn't already running.
 * Only call this for operations that need live computation; plain reads
 * should just fall back to the flat files instead, and rule/config writes
 * never need the daemon at all.
 */
export async function ensureDaemonRunning(): Promise<EnsureDaemonResult> {
  if (await daemonGet("/health")) return { ok: true };

  let launched = false;
  for (const bundleId of BUNDLE_IDS) {
    try {
      await execFileAsync("open", ["-g", "-j", "-b", bundleId]);
      launched = true;
      break;
    } catch {
      // Bundle id not registered (app never opened, or a differently signed
      // build) — try the next id, then fall back to launch-by-name below.
    }
  }
  if (!launched) {
    try {
      await execFileAsync("open", ["-g", "-j", "-a", "Veyr"]);
      launched = true;
    } catch {
      // Handled by the ok:false branch below.
    }
  }
  if (!launched) {
    return { ok: false, reason: "Couldn't find the Veyr app to launch it. Install/open Veyr, then retry." };
  }

  const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await daemonGet("/health", 500)) return { ok: true };
    await new Promise((resolve) => setTimeout(resolve, LAUNCH_POLL_INTERVAL_MS));
  }
  return { ok: false, reason: "Launched Veyr but it didn't come up in time. Check that it's running, then retry." };
}
