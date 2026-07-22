// Detached background worker spawned by updateCheck.ts: asks the public npm
// registry for getcanopy's latest version and writes it to
// ~/.veyr/cache/cli-update-check.json for the next CLI run to read. Exits
// silently on any failure — an offline machine simply never gets the nudge.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { updateCheckCacheFilePath } from "@veyr/core";

const REGISTRY_URL = "https://registry.npmjs.org/getcanopy/latest";
const TIMEOUT_MS = 10_000;

try {
  const response = await fetch(REGISTRY_URL, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (response.ok) {
    const body = (await response.json()) as { version?: unknown };
    if (typeof body.version === "string" && body.version.length > 0) {
      const outFile = updateCheckCacheFilePath();
      await mkdir(dirname(outFile), { recursive: true });
      await writeFile(
        outFile,
        JSON.stringify({ latest: body.version, checkedAt: new Date().toISOString() }),
        "utf8"
      );
    }
  }
} catch {
  // Silent by design.
}
