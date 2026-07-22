#!/usr/bin/env node
// Bundles the CLI with esbuild. Bundling (rather than plain tsc) is what
// lets the published npm package depend on @veyr/core, which is a private,
// source-only workspace package — its TypeScript is inlined here, so
// `npm install -g getcanopy` needs no workspace and no registry copy of it.
// Two entries: the CLI itself, and the detached update-check worker that
// updateCheck.ts spawns as dist/updateCheckWorker.js (the "./updateCheckWorker.js"
// URL it builds resolves next to the bundled dist/index.js).
import { build } from "esbuild";

await build({
  entryPoints: {
    index: "src/index.ts",
    updateCheckWorker: "src/veyr/updateCheckWorker.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outdir: "dist",
  // CJS deps (commander) call require() at runtime; esbuild's ESM output
  // needs a real one in scope. Goes after the entry's hashbang.
  banner: {
    js: 'import { createRequire as __cliCreateRequire } from "node:module"; const require = __cliCreateRequire(import.meta.url);',
  },
  // chalk/commander/@clack are inlined too — the published package has zero
  // runtime dependencies, which keeps global installs small and fast.
  sourcemap: false,
  logLevel: "info",
});
