// Small self-contained client for the daemon the Veyr menu bar app hosts on
// 127.0.0.1 while it's running (see packages/desktop-mac/Sources/CodexBar/Veyr/
// VeyrDaemonServer.swift and packages/cli/src/veyr/daemon.ts for the CLI's
// equivalent). Not shared with packages/cli: the two packages aren't
// structurally linked today, and this extension has zero runtime
// dependencies, so a ~30-line duplicate is simpler than wiring up a shared
// internal package for one small client. Read-only: this extension never
// needs to trigger live computation (no graph --refresh equivalent here),
// so there's no headless-launch helper — daemon absence just means no
// suggestions, handled the same way a daemon-absent status read degrades.

import * as http from "node:http";
import { veyrConfigPath } from "./agentStatus";
import * as fs from "node:fs";
import * as path from "node:path";

interface DaemonInfo {
  readonly port: number;
}

function daemonInfoPath(): string {
  return path.join(path.dirname(veyrConfigPath()), "daemon.json");
}

function readDaemonInfo(): DaemonInfo | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(daemonInfoPath(), "utf8")) as Partial<DaemonInfo>;
    return typeof parsed.port === "number" ? (parsed as DaemonInfo) : null;
  } catch {
    return null;
  }
}

const DEFAULT_TIMEOUT_MS = 300;

/** Best-effort GET against the daemon. Never throws — null means "not
 * running or not reachable," the normal state when the menu bar app is closed. */
export function daemonGet<T>(requestPath: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T | null> {
  const info = readDaemonInfo();
  if (!info) return Promise.resolve(null);
  return new Promise((resolve) => {
    const req = http.request(
      { host: "127.0.0.1", port: info.port, path: requestPath, method: "GET", timeout: timeoutMs },
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
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}
