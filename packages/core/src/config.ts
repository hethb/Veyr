// Reader/writer for ~/.veyr/config.json — small shared config the Mac app,
// VS Code extension, and this CLI all read/write (each surface can flip the
// same toggles). Mirrors VeyrConfig.swift's raw-dict merge-on-save: unknown
// keys written by other tools/surfaces are always preserved.

import * as fs from "node:fs";
import * as path from "node:path";
import { configFilePath } from "./paths.js";

function readRaw(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configFilePath(), "utf8"));
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, unknown>;
  } catch {
    // Missing or invalid file — treat as empty; every key has a documented default.
  }
  return {};
}

/** `autoUpdateGuidance` — the master gate for the `## Veyr agent guidance` CLAUDE.md
 * section. Absent/undefined means off (this is a newer, separately opt-in section). */
export function readAutoUpdateGuidance(): boolean {
  const value = readRaw()["autoUpdateGuidance"];
  return typeof value === "boolean" ? value : false;
}

/** `autoUpdateClaudeMd` — the master gate for the `## Veyr spend status` section.
 * Absent/undefined means on (this is the original, default-on injection). */
export function readAutoUpdateClaudeMd(): boolean {
  const value = readRaw()["autoUpdateClaudeMd"];
  return typeof value === "boolean" ? value : true;
}

/** `promptStyleLearning` — gates the on-device prompt-style corpus + `veyr
 * compose` completions. Absent/undefined means off: this is the first Veyr
 * feature that persists anything derived from prompt text content, not just
 * scalar/boolean features, so it stays opt-in until reviewed. */
export function readPromptStyleLearning(): boolean {
  const value = readRaw()["promptStyleLearning"];
  return typeof value === "boolean" ? value : false;
}

/** `savingsTracker` — gates the retrospective token/dollar savings tracker.
 * Absent/undefined means off, pending an explicit methodology review before
 * this is shown by default (see packages/desktop-mac/Sources/VeyrKit/Savings/
 * VeyrSavingsCalculator.swift for the exact estimation formulas). */
export function readSavingsTracker(): boolean {
  const value = readRaw()["savingsTracker"];
  return typeof value === "boolean" ? value : false;
}

/** Sets exactly one key, preserving every other key already in the file
 * (written by the Mac app, VS Code extension, or a prior CLI run). */
export function writeConfigKey(key: string, value: unknown): void {
  const config = readRaw();
  config[key] = value;
  fs.mkdirSync(path.dirname(configFilePath()), { recursive: true });
  fs.writeFileSync(configFilePath(), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}
