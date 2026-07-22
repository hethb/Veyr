// @veyr/core — Veyr's shared local-data engine, extracted from the CLI
// (packages/cli) so the VS Code extension can compute the same data without
// the desktop app. Everything here is UI-free (no chalk, no vscode, no
// commander): pure filesystem reads of agent logs and ~/.veyr/, loopback
// daemon calls, and the local Graphify build. Consumers bundle this source
// directly (esbuild) — there is no build step and no published artifact.
//
// The Swift twin of much of this lives in packages/desktop-mac/Sources, as
// hand-synced mirrors — update both sides together: pricing.ts ↔
// CostUsagePricing.swift's claude table, tags.ts ↔ FeatureTagInferrer.swift,
// guidanceRules.ts ↔ VeyrGuidanceRules.swift, and graphify.ts ↔
// PythonEnv.swift + GraphifyRunner.swift (the Graphify pin, the trimmed
// graph-cache schema, and the FNV-1a StableHash must stay identical — the
// CLI/extension and the app share ~/.veyr/cache/graphify/<hash>/ build dirs).

export * from "./paths.js";
export * from "./config.js";
export * from "./daemon.js";
export * from "./pricing.js";
export * from "./tags.js";
export * from "./claudeSessionScanner.js";
export * from "./codexSessionScanner.js";
export * from "./sessions.js";
export * from "./status.js";
export * from "./localStatus.js";
export * from "./savingsStore.js";
export * from "./guidanceRules.js";
export * from "./graph.js";
export * from "./graphRelations.js";
export * from "./graphify.js";
