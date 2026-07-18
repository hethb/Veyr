#!/usr/bin/env node
// Copies the dashboard's single-file graph embed bundle into this
// extension's media/ so the webview panel (src/graphPanel.ts) can load it
// straight off disk, with no bundler wiring of its own. Builds the
// dashboard's embed target first — see
// packages/dashboard/vite.embed.config.ts for what actually produces it.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const builtBundle = join(repoRoot, "packages", "dashboard", "dist-embed", "embed.html");
const outDir = join(here, "..", "media", "graph");
const outFile = join(outDir, "index.html");

execFileSync("npm", ["run", "build:embed", "--workspace=@promptlens/dashboard"], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (!existsSync(builtBundle)) {
  throw new Error(
    `Expected ${builtBundle} after building the dashboard's embed target — did the build fail silently?`
  );
}

mkdirSync(outDir, { recursive: true });
copyFileSync(builtBundle, outFile);
console.log(`Copied graph embed bundle -> ${outFile}`);
