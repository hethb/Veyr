/**
 * Reader for `~/.veyr/config.json` — the shared preference file the Veyr Mac
 * app's Settings pane writes. Lets Mac-app toggles govern proxy behavior
 * (trimming strategy, detectors) without a second config surface.
 * Cached with a 30s TTL; missing file → defaults.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TrimStrategy } from "./ConversationTrimmer.js";

export interface VeyrSharedConfig {
  trimStrategy: TrimStrategy | "off";
  outputConstraints: boolean;
  batchApiDetection: boolean;
  structuredOutputDetection: boolean;
}

export const DEFAULT_SHARED_CONFIG: VeyrSharedConfig = {
  trimStrategy: "last_n",
  outputConstraints: true,
  batchApiDetection: true,
  structuredOutputDetection: true,
};

const TTL_MS = 30_000;
let cached: { value: VeyrSharedConfig; at: number } | null = null;

function configPath(): string {
  return path.join(os.homedir(), ".veyr", "config.json");
}

export function getSharedConfig(now: number = Date.now()): VeyrSharedConfig {
  if (cached && now - cached.at < TTL_MS) return cached.value;
  let value = DEFAULT_SHARED_CONFIG;
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath(), "utf8")) as Record<
      string,
      unknown
    >;
    const strategy = parsed.trimStrategy;
    value = {
      trimStrategy:
        strategy === "off" ||
        strategy === "last_n" ||
        strategy === "summarize" ||
        strategy === "key_points_only"
          ? strategy
          : DEFAULT_SHARED_CONFIG.trimStrategy,
      outputConstraints:
        typeof parsed.outputConstraints === "boolean"
          ? parsed.outputConstraints
          : DEFAULT_SHARED_CONFIG.outputConstraints,
      batchApiDetection:
        typeof parsed.batchApiDetection === "boolean"
          ? parsed.batchApiDetection
          : DEFAULT_SHARED_CONFIG.batchApiDetection,
      structuredOutputDetection:
        typeof parsed.structuredOutputDetection === "boolean"
          ? parsed.structuredOutputDetection
          : DEFAULT_SHARED_CONFIG.structuredOutputDetection,
    };
  } catch {
    // Missing/invalid — defaults.
  }
  cached = { value, at: now };
  return value;
}

/** Test hook. */
export function resetSharedConfigCache(): void {
  cached = null;
}
