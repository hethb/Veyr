// Feature-tag inference from a session's working directory — a port of
// packages/desktop-mac/Sources/VeyrKit/Costs/FeatureTagInferrer.swift so the
// CLI's sessions.json fallback tags sessions the same way the Mac app does.
// Manual overrides in ~/.veyr/tag-overrides.json (project path → tag) win
// over inference; keep the ignored-components list in sync with the Swift
// copy by hand.

import * as fs from "node:fs";
import * as os from "node:os";
import { expandTilde, tagOverridesFilePath } from "./paths.js";

export const UNTAGGED = "untagged";

const IGNORED_COMPONENTS = new Set([
  "~", "code", "projects", "src", "dev", "work",
  "Documents", "Desktop", "Users", "home", "repos", "git",
]);

function normalize(p: string): string {
  let normalized = expandTilde(p);
  while (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function loadOverrides(): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(tagOverridesFilePath(), "utf8"));
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null) return {};
  const expanded: Record<string, string> = {};
  for (const [path, tag] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (trimmed) expanded[normalize(path)] = trimmed;
  }
  return expanded;
}

export interface TagInferrer {
  inferTag(projectPath: string | null | undefined): string;
}

export function loadTagInferrer(): TagInferrer {
  const overrides = loadOverrides();
  return {
    inferTag(projectPath: string | null | undefined): string {
      if (!projectPath) return UNTAGGED;
      const normalized = normalize(projectPath);

      const exact = overrides[normalized];
      if (exact) return exact;
      let longestPrefix: string | undefined;
      for (const key of Object.keys(overrides)) {
        if (normalized.startsWith(`${key}/`) && key.length > (longestPrefix?.length ?? -1)) {
          longestPrefix = key;
        }
      }
      if (longestPrefix) return overrides[longestPrefix]!;

      const display = normalized.replace(os.homedir(), "~");
      const components = display.split("/").filter((c) => c.length > 0 && !IGNORED_COMPONENTS.has(c));
      const tag = components[components.length - 1] ?? UNTAGGED;
      return tag === "" ? UNTAGGED : tag;
    },
  };
}
