#!/usr/bin/env node
// Veyr terminal CLI — usage/cost, Graphify graph status, and agent-guidance
// rules, read straight from the same local ~/.veyr/ files the Veyr menu bar
// app writes. No proxy, no network calls, no traffic interception.

import { createRequire } from "node:module";
import { Command } from "commander";
import { run } from "./cliError.js";
import { graphCommand } from "./commands/graph.js";
import {
  rulesDisableCommand,
  rulesEnableCommand,
  rulesListCommand,
  rulesOffCommand,
  rulesOnCommand,
} from "./commands/rules.js";
import { statusCommand } from "./commands/status.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("veyr")
  .description("Veyr terminal CLI — usage/cost, graph status, and agent guidance, read from local Veyr data")
  .version(version);

program
  .command("status")
  .description("Current session cost, today's spend, budget, alerts, and recommendations")
  .option("--watch", "Poll and re-render on change (not a live event stream)")
  .option("--json", "Print the raw VEYR_STATUS.json payload")
  .action((opts) => run(() => statusCommand(opts)));

program
  .command("graph")
  .description("Graphify codebase graph status for the workspace Veyr last built")
  .option("--json", "Print the raw graph cache payload")
  .option("--top <n>", "Number of top-connected nodes to show", "10")
  .action((opts) => run(() => graphCommand(opts)));

const rules = program
  .command("rules")
  .description("View and toggle the CLAUDE.md agent-guidance rule set");

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

program.parseAsync(process.argv);
