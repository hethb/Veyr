#!/bin/bash
# Regenerates Sources/CodexBar/Resources/graph-embed/index.html from
# packages/dashboard's embed build (see packages/dashboard/vite.embed.config.ts).
#
# This is checked in and versioned deliberately, not built live by `swift
# build` — SwiftPM resources have to exist at build time, and this repo
# already treats "pin, don't build live" as the right default for anything
# Graphify-adjacent (see GRAPHIFY_INTEGRATION.md's pinned-commit install).
# Run this manually whenever GraphCanvas or the embed bundle changes, and
# commit the result.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../../.." && pwd)"
dashboard_dir="$repo_root/packages/dashboard"
out_dir="$script_dir/../Sources/CodexBar/Resources/graph-embed"

(cd "$repo_root" && npm run build:embed --workspace=@promptlens/dashboard)

mkdir -p "$out_dir"
cp "$dashboard_dir/dist-embed/embed.html" "$out_dir/index.html"

echo "Updated $out_dir/index.html — review the diff and commit it."
