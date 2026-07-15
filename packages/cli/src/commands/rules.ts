// `veyr rules` — view and toggle the CLAUDE.md agent-guidance rule set from
// ~/.veyr/guidance-rules.json, plus its master gate in ~/.veyr/config.json.
// Deliberately file-only, unlike status/graph: this is config, not something
// that needs live computation, so it uses the same trust model as the rest
// of the repo and never depends on the daemon being up. Writes still take
// effect on the Mac app's next tick (≤5 min) — the daemon doesn't shortcut
// that, by design.

import chalk from "chalk";
import { CliError } from "../cliError.js";
import { readAutoUpdateGuidance, writeConfigKey } from "../veyr/config.js";
import { readRules, writeRules } from "../veyr/guidanceRules.js";

export async function rulesListCommand(): Promise<void> {
  const gateOn = readAutoUpdateGuidance();
  const ruleSet = readRules();

  console.log(
    gateOn
      ? chalk.green("autoUpdateGuidance: ON") + chalk.dim("  — rules below are injected into CLAUDE.md")
      : chalk.dim("autoUpdateGuidance: OFF") + chalk.dim("  — run `veyr rules on` to start injecting")
  );
  console.log();

  for (const rule of ruleSet.rules) {
    const mark = rule.enabled ? chalk.green("✓") : chalk.dim("✗");
    console.log(`${mark} ${chalk.bold(rule.id)}  ${rule.title}`);
    console.log(chalk.dim(`    ${rule.body}`));
  }
  console.log();
  console.log(chalk.dim(`${ruleSet.rules.filter((r) => r.enabled).length}/${ruleSet.rules.length} rules enabled`));
}

function setRuleEnabled(id: string, enabled: boolean): void {
  const ruleSet = readRules();
  const rule = ruleSet.rules.find((r) => r.id === id);
  if (!rule) {
    throw new CliError(
      chalk.red(`✗ No rule with id "${id}".`) + "\n  Run `veyr rules list` to see valid ids."
    );
  }
  rule.enabled = enabled;
  writeRules(ruleSet);
  console.log(chalk.green(`✓ ${id} ${enabled ? "enabled" : "disabled"}`));
  console.log(chalk.dim("  Takes effect on the Mac app's next tick (≤5 min)."));
}

export async function rulesEnableCommand(id: string): Promise<void> {
  setRuleEnabled(id, true);
}

export async function rulesDisableCommand(id: string): Promise<void> {
  setRuleEnabled(id, false);
}

function setGate(enabled: boolean): void {
  writeConfigKey("autoUpdateGuidance", enabled);
  console.log(chalk.green(`✓ autoUpdateGuidance ${enabled ? "ON" : "OFF"}`));
  console.log(chalk.dim("  Takes effect on the Mac app's next tick (≤5 min)."));
}

export async function rulesOnCommand(): Promise<void> {
  setGate(true);
}

export async function rulesOffCommand(): Promise<void> {
  setGate(false);
}
