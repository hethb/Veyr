// Reader/writer for ~/.veyr/guidance-rules.json — the editable rule set
// rendered into CLAUDE.md's `## Veyr agent guidance` section by
// packages/desktop-mac/Sources/VeyrKit/Guidance/VeyrGuidanceRules.swift.
// Plain camelCase JSON, no key-strategy conversion. Edits here are picked up
// by the Mac app on its next tick (≤5 min) — deliberately file-only, not
// routed through the daemon; see commands/rules.ts for why.

import * as fs from "node:fs";
import * as path from "node:path";
import { guidanceRulesFilePath } from "./paths.js";

export interface GuidanceRule {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
}

export interface GuidanceRuleSet {
  version: number;
  rules: GuidanceRule[];
}

/**
 * Byte-identical to VeyrGuidanceRules.swift's `defaultRuleSet`
 * (packages/desktop-mac/Sources/VeyrKit/Guidance/VeyrGuidanceRules.swift).
 * Duplicated here (not read from the Swift file — there's no shared module
 * across the Swift/TypeScript boundary) so `veyr rules list` is useful even
 * before the Mac app has run once and seeded the file itself. Keep the two
 * copies in sync by hand; if you change one, change the other.
 */
export const DEFAULT_RULE_SET: GuidanceRuleSet = {
  version: 1,
  rules: [
    {
      id: "no-unverified-claims",
      title: "Don't state unverified claims as fact",
      body:
        "If you haven't checked something — a file's contents, whether a test passes, " +
        "how an API behaves — verify it before asserting it, or say explicitly that it's " +
        "unverified. Don't present a guess as a confirmed fact.",
      enabled: true,
    },
    {
      id: "no-full-restate-before-small-edit",
      title: "Don't restate full context before a small edit",
      body:
        "Before making a small, targeted change, don't echo the whole file or unchanged " +
        "surrounding code back first. Reference only the specific lines being changed.",
      enabled: true,
    },
    {
      id: "no-acknowledgment-padding",
      title: "Skip acknowledgment boilerplate",
      body:
        "Don't open responses by restating the task, thanking the user, or narrating what " +
        "you're about to do before doing it. Lead with the substantive content or the action " +
        "itself.",
      enabled: true,
    },
  ],
};

function isGuidanceRuleSet(value: unknown): value is GuidanceRuleSet {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record["rules"]);
}

/** Reads the rule set on disk, or the default seed if the file is missing/unparsable. */
export function readRules(): GuidanceRuleSet {
  let raw: string;
  try {
    raw = fs.readFileSync(guidanceRulesFilePath(), "utf8");
  } catch {
    return DEFAULT_RULE_SET;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isGuidanceRuleSet(parsed)) return parsed;
  } catch {
    // fall through to default
  }
  return DEFAULT_RULE_SET;
}

export function writeRules(ruleSet: GuidanceRuleSet): void {
  fs.mkdirSync(path.dirname(guidanceRulesFilePath()), { recursive: true });
  fs.writeFileSync(guidanceRulesFilePath(), `${JSON.stringify(ruleSet, null, 2)}\n`, "utf8");
}
