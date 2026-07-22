#!/usr/bin/env node
// Bundles the extension with esbuild — required since it imports @veyr/core,
// a private source-only workspace package whose TypeScript gets inlined here,
// keeping the .vsix self-contained with node_modules still fully excluded
// (see .vscodeignore). Output stays CJS at out/extension.js, the same entry
// package.json's "main" always pointed at. `--watch` rebuilds on change for
// the F5 debug loop.
import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  outfile: "out/extension.js",
  sourcemap: false,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("watching src/ …");
} else {
  await build(options);
}
