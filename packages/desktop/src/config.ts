// Shared user config at ~/.veyr/config.json.
//
// This file is the contract between the desktop app and the CLI: the desktop
// app writes `proxyUrl` + `apiKey` here when it starts the proxy, and CLI
// tools read the same file to find it.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface VeyrConfig {
  proxyUrl: string;
  apiKey?: string;
  defaultFeatureTag: string;
  openAtLogin: boolean;
  /** Extra env vars passed to the spawned proxy process. */
  proxyEnv: Record<string, string>;
}

export const CONFIG_DIR = join(homedir(), ".veyr");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULTS: VeyrConfig = {
  proxyUrl: "http://localhost:3001",
  defaultFeatureTag: "untagged",
  openAtLogin: false,
  // Anon requests let header-less tools (Claude Code, plain curl) be logged.
  proxyEnv: { VEYR_ALLOW_ANON: "true" },
};

export function configExists(): boolean {
  return existsSync(CONFIG_PATH);
}

export function loadConfig(): VeyrConfig {
  let onDisk: Partial<VeyrConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      onDisk = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<VeyrConfig>;
    } catch (err) {
      console.error(`[config] failed to parse ${CONFIG_PATH}, using defaults:`, err);
    }
  }
  return {
    ...DEFAULTS,
    ...onDisk,
    proxyEnv: { ...DEFAULTS.proxyEnv, ...(onDisk.proxyEnv ?? {}) },
  };
}

export function saveConfig(patch: Partial<VeyrConfig>): VeyrConfig {
  const merged = { ...loadConfig(), ...patch };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return merged;
}
