#!/usr/bin/env node
// Veyr terminal CLI — usage/cost, Graphify graph status, and agent-guidance
// rules. A thin client of the daemon the Veyr menu bar app hosts on
// 127.0.0.1 while it's running, falling back to the same local ~/.veyr/
// files it writes when the daemon isn't reachable. No proxy, no traffic
// interception — the only network calls this makes are loopback, to a
// process on this machine.

import { createRequire } from "node:module";
import chalk from "chalk";
import { Command } from "commander";
import { run } from "./cliError.js";
import { composeCommand } from "./commands/compose.js";
import { dashboardCommand } from "./commands/dashboard.js";
import { graphCommand } from "./commands/graph.js";
import {
  rulesDisableCommand,
  rulesEnableCommand,
  rulesListCommand,
  rulesOffCommand,
  rulesOnCommand,
} from "./commands/rules.js";
import {
  savingsCommand,
  savingsDisableCommand,
  savingsEnableCommand,
  savingsStatusCommand,
} from "./commands/savings.js";
import { statusCommand } from "./commands/status.js";
import { styleDisableCommand, styleEnableCommand, styleStatusCommand } from "./commands/style.js";
import { usageCommand } from "./commands/usage.js";
import { hasShownFirstRun, markFirstRunShown } from "./veyr/cliState.js";
import { divider } from "./ui.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("veyr")
  .description(
    "Veyr terminal CLI — usage/cost, graph status, and agent guidance, read from local Veyr data. Run with no arguments for the dashboard."
  )
  .version(version)
  // Bare `veyr` renders the dashboard (welcome variant on the very first run).
  .action(() =>
    run(async () => {
      const welcome = !hasShownFirstRun();
      if (welcome) markFirstRunShown();
      await dashboardCommand({ welcome, version });
    })
  );

program
  .command("dashboard")
  .description("Terminal overview: session, usage, graph, savings, rules, and every command")
  .action(() => run(() => dashboardCommand({ version })));

program
  .command("status")
  .description("Current session cost, today's spend, budget, alerts, tool health, and recommendations")
  .option("--watch", "Poll and re-render on change (not a live event stream)")
  .option("--json", "Print the raw VEYR_STATUS.json payload")
  .action((opts) => run(() => statusCommand(opts)));

program
  .command("usage")
  .description("Per-agent and per-project spend breakdown, 7-day trend, and session timeline")
  .option("--sessions <n>", "Number of recent sessions to list", "8")
  .option("--json", "Print the raw session entries")
  .action((opts) => run(() => usageCommand(opts)));

program
  .command("graph")
  .description("Graphify codebase graph status for the workspace Veyr last built")
  .option("--json", "Print the raw graph cache payload")
  .option("--top <n>", "Number of top-connected nodes to show", "10")
  .option("--refresh", "Trigger an on-demand rescan of the current directory via the daemon")
  .action((opts) => run(() => graphCommand(opts)));

const rules = program
  .command("rules")
  .description("View and toggle the CLAUDE.md agent-guidance rule set")
  // Bare `veyr rules` behaves like `veyr rules list`.
  .action(() => run(rulesListCommand));

rules
  .command("list")
  .description("Show the master gate and every rule's enabled state")
  .action(() => run(rulesListCommand));

rules
  .command("enable <id>")
  .description("Enable one rule by id")
  .action((id: string) => run(() => rulesEnableCommand(id)));

rules
  .command("disable <id>")
  .description("Disable one rule by id")
  .action((id: string) => run(() => rulesDisableCommand(id)));

rules
  .command("on")
  .description("Turn on CLAUDE.md guidance injection (master gate, default off)")
  .action(() => run(rulesOnCommand));

rules
  .command("off")
  .description("Turn off CLAUDE.md guidance injection")
  .action(() => run(rulesOffCommand));

program
  .command("compose")
  .description("Compose a prompt interactively, with style-based ghost-text suggestions; copies to clipboard when done")
  .action(() => run(composeCommand));

const style = program
  .command("style")
  .description("View or toggle on-device prompt-style learning (off by default)");

style
  .command("status")
  .description("Show whether prompt-style learning is on")
  .action(() => run(styleStatusCommand));

style
  .command("enable")
  .description("Turn on prompt-style learning + `veyr compose` suggestions")
  .action(() => run(styleEnableCommand));

style
  .command("disable")
  .description("Turn off prompt-style learning + `veyr compose` suggestions")
  .action(() => run(styleDisableCommand));

const savings = program
  .command("savings")
  .description("Retrospective token/dollar savings — lifetime + current project (off by default)")
  .option("--detail", "Show the full per-component breakdown and methodology")
  .option("--projects", "Break savings down per project (all time)")
  .action((opts) => run(() => savingsCommand(opts)));

savings
  .command("status")
  .description("Show whether the savings tracker is on")
  .action(() => run(savingsStatusCommand));

savings
  .command("enable")
  .description("Turn on the savings tracker")
  .action(() => run(savingsEnableCommand));

savings
  .command("disable")
  .description("Turn off the savings tracker")
  .action(() => run(savingsDisableCommand));

/**
 * One-time welcome dashboard: the first time the CLI runs after install, show
 * the orientation screen before whatever was asked for. Skipped when the
 * output isn't a TTY or the invocation wants machine-readable/help/version
 * output, so scripts and pipes never get a dashboard spliced into stdout.
 * Bare `veyr` handles first-run itself (the root action renders the welcome
 * variant directly), so this hook only fires for subcommand invocations.
 */
async function maybeShowFirstRunWelcome(argv: readonly string[]): Promise<void> {
  if (argv.length === 0) return; // bare `veyr` — root action owns first-run
  if (hasShownFirstRun()) return;
  if (!process.stdout.isTTY) return;
  const quietFlags = new Set(["--json", "--help", "-h", "--version", "-V", "help"]);
  if (argv.some((arg) => quietFlags.has(arg))) return;

  markFirstRunShown();
  await dashboardCommand({ welcome: true, version });
  console.log();
  console.log(divider(70));
  console.log(chalk.dim(`— output of \`veyr ${argv.join(" ")}\` below —`));
  console.log(divider(70));
}

await maybeShowFirstRunWelcome(process.argv.slice(2));
program.parseAsync(process.argv);
