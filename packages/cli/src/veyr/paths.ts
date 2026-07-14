// Paths into ~/.veyr/, mirroring packages/desktop-mac/Sources/VeyrKit/VeyrPaths.swift.
// Pure file-system layout — no network, no daemon process to talk to.

import * as os from "node:os";
import * as path from "node:path";

export function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function veyrHome(): string {
  return path.join(os.homedir(), ".veyr");
}

export function statusFilePath(): string {
  return path.join(veyrHome(), "agent-status", "VEYR_STATUS.json");
}

export function graphCacheFilePath(): string {
  return path.join(veyrHome(), "cache", "graph.json");
}

export function guidanceRulesFilePath(): string {
  return path.join(veyrHome(), "guidance-rules.json");
}

export function configFilePath(): string {
  return path.join(veyrHome(), "config.json");
}
