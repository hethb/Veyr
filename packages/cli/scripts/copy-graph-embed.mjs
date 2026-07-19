#!/usr/bin/env node
// Copies the dashboard's single-file graph embed bundle into dist/ so
// `veyr graph open` (src/commands/graphOpen.ts) can inject the local graph
// cache into it and hand the result to the browser. Builds the dashboard's
// embed target first — see packages/dashboard/vite.embed.config.ts for what
// actually produces it. Same pattern as the VS Code extension's
// scripts/copy-graph-embed.mjs; dist/ is what npm publishes ("files").
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const builtBundle = join(repoRoot, "packages", "dashboard", "dist-embed", "embed.html");
const outFile = join(here, "..", "dist", "embed.html");

execFileSync("npm", ["run", "build:embed", "--workspace=@promptlens/dashboard"], {
  cwd: repoRoot,
  stdio: "inherit",
});

if (!existsSync(builtBundle)) {
  throw new Error(
    `Expected ${builtBundle} after building the dashboard's embed target — did the build fail silently?`
  );
}

mkdirSync(dirname(outFile), { recursive: true });
copyFileSync(builtBundle, outFile);
console.log(`Copied graph embed bundle -> ${outFile}`);
