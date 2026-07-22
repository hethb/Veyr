// ~/.veyr/cli.json — state owned by this CLI alone (the Mac app and VS Code
// extension never read or write it). Currently just the first-run marker
// behind the one-time welcome dashboard.

import * as fs from "node:fs";
import * as path from "node:path";
import { cliStateFilePath } from "@veyr/core";

interface CliState {
  firstRunShownAt?: string;
}

function readState(): CliState {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(cliStateFilePath(), "utf8"));
    if (typeof parsed === "object" && parsed !== null) return parsed as CliState;
  } catch {
    // Missing or invalid — treat as first run.
  }
  return {};
}

export function hasShownFirstRun(): boolean {
  return typeof readState().firstRunShownAt === "string";
}

export function markFirstRunShown(): void {
  const state = readState();
  state.firstRunShownAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(cliStateFilePath()), { recursive: true });
  fs.writeFileSync(cliStateFilePath(), `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
