// Client for the daemon Veyr's menu bar app hosts while it's running
// (packages/desktop-mac/Sources/CodexBar/Veyr/VeyrDaemonServer.swift). There
// is no standalone daemon binary — the "daemon" is the always-running menu
// bar app's in-process HTTP server, discovered via ~/.veyr/daemon.json.
//
// Reads (status/graph/rules) prefer the daemon for freshness but always fall
// back to the flat ~/.veyr/ files when it's unreachable — the app not
// running (or not installed at all) is a normal, expected state, not an
// error. The CLI never launches the app: anything it can't get from the
// daemon it computes itself (see sessions.ts, localStatus.ts, graphify.ts).

import * as fs from "node:fs";
import * as http from "node:http";
import { daemonInfoFilePath } from "./paths.js";

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
