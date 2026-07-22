// Once-a-day nudge when npm has a newer getcanopy than the one running.
// update-notifier model, so no command ever waits on the network: each run
// reads the cache written by a previous run and, when that cache is stale,
// respawns the detached worker (updateCheckWorker.ts) to refresh it for next
// time. The registry call is the CLI's only network access, and it can be
// switched off entirely with VEYR_NO_UPDATE_CHECK=1.

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { updateCheckCacheFilePath } from "@veyr/core";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface UpdateCheckCache {
  readonly latest: string;
  readonly checkedAt: string;
}

function parseVersion(v: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** True when `candidate` is a strictly newer x.y.z than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function readCache(): Promise<UpdateCheckCache | null> {
  try {
    const parsed = JSON.parse(await readFile(updateCheckCacheFilePath(), "utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as UpdateCheckCache).latest === "string" &&
      typeof (parsed as UpdateCheckCache).checkedAt === "string"
    ) {
      return parsed as UpdateCheckCache;
    }
  } catch {
    // Missing or corrupt cache — the worker will rewrite it.
  }
  return null;
}

/**
 * Prints an update recommendation to stderr when the last known npm version
 * is ahead of the running one, and refreshes the cache in the background at
 * most once a day. Never throws, never blocks the command.
 */
export async function maybeNudgeUpdate(currentVersion: string): Promise<void> {
  if (process.env.VEYR_NO_UPDATE_CHECK || process.env.CI) return;
  if (!process.stderr.isTTY) return;

  const cache = await readCache();

  if (cache && isNewerVersion(cache.latest, currentVersion)) {
    process.stderr.write(
      chalk.yellow(`▲ veyr ${cache.latest} is out`) +
        chalk.dim(` (you have ${currentVersion}) — update: `) +
        chalk.bold("npm install -g getcanopy@latest") +
        "\n\n"
    );
  }

  const checkedAt = cache ? Date.parse(cache.checkedAt) : Number.NaN;
  const fresh = Number.isFinite(checkedAt) && Date.now() - checkedAt < CHECK_INTERVAL_MS;
  if (fresh) return;

  try {
    const worker = fileURLToPath(new URL("./updateCheckWorker.js", import.meta.url));
    spawn(process.execPath, [worker], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // A machine that can't spawn the worker just never sees the nudge.
  }
}
