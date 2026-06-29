// Config resolution for the Veyr CLI.
//
// Priority: env vars > ~/.veyr/config.json > defaults. The same file is
// written by the desktop app when it starts the proxy, so the CLI finds a
// desktop-managed proxy automatically.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface VeyrConfig {
  proxyUrl: string;
  apiKey?: string;
  defaultFeatureTag: string;
}

export const CONFIG_DIR = join(homedir(), ".veyr");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

const DEFAULTS: VeyrConfig = {
  proxyUrl: "http://localhost:3001",
  defaultFeatureTag: "untagged",
};

function readConfigFile(): Partial<VeyrConfig> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<VeyrConfig>;
  } catch {
    // A corrupt config file must never break the CLI — fall back to defaults.
    return {};
  }
}

export function loadConfig(): VeyrConfig {
  const onDisk = readConfigFile();
  return {
    ...DEFAULTS,
    ...onDisk,
    proxyUrl:
      process.env.VEYR_PROXY_URL?.trim() ||
      onDisk.proxyUrl ||
      DEFAULTS.proxyUrl,
    apiKey: process.env.VEYR_API_KEY?.trim() || onDisk.apiKey,
  };
}

export function saveConfig(config: Partial<VeyrConfig>): void {
  // Merge with the raw file contents (not env-overridden values) so an env
  // var set for one invocation never gets baked into the file.
  const merged = { ...readConfigFile(), ...config };
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf8");
}
