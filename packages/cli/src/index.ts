#!/usr/bin/env node
// Canopy terminal CLI — monitor LLM costs from your terminal.

import { createRequire } from "node:module";
import { Command } from "commander";
import open from "open";
import { run, proxyUrl } from "./api.js";
import { statusCommand } from "./commands/status.js";
import { suggestionsCommand } from "./commands/suggestions.js";
import { policyListCommand, policySetCommand, type PolicySetOptions } from "./commands/policy.js";
import { logsCommand, type LogsOptions } from "./commands/logs.js";
import { configCommand } from "./commands/configCmd.js";
import {
  integrateClaudeCode,
  integrateCursor,
  integrateShell,
  type ClaudeCodeOptions,
} from "./commands/integrate.js";
import { initCommand } from "./commands/init.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("canopy")
  .description("Canopy terminal CLI — monitor LLM costs from your terminal")
  .version(version);

program
  .command("init")
  .description("Interactive setup — connect to a proxy and pick an integration")
  .action(() => run(initCommand));

program
  .command("status")
  .description("Show proxy status and today's / this week's / this month's spend")
  .action(() => run(() => statusCommand(version)));

program
  .command("suggestions")
  .description("Show cost-optimization suggestions with the commands to act on them")
  .action(() => run(suggestionsCommand));

const policy = program.command("policy").description("View and edit feature policies");

policy
  .command("list")
  .description("Show all feature policies as a table")
  .action(() => run(policyListCommand));

policy
  .command("set <feature-tag>")
  .description("Set or update a feature policy")
  .option("--budget <amount>", "monthly budget cap in USD (e.g. 50)")
  .option("--model <model>", "fallback model (e.g. gpt-4o-mini)")
  .option("--max-tokens <n>", "max completion tokens (e.g. 512)")
  .option("--rate-limit <n>", "requests per minute (e.g. 60)")
  .option("--cache <true|false>", "enable cache_control injection")
  .action((featureTag: string, opts: PolicySetOptions) =>
    run(() => policySetCommand(featureTag, opts))
  );

program
  .command("logs")
  .description("Show recent request logs")
  .option("--tag <feature>", "filter by feature tag")
  .option("--limit <n>", "number of rows", "20")
  .option("--follow", "poll for new requests every 2s, like tail -f")
  .action((opts: LogsOptions) => run(() => logsCommand(opts)));

const integrate = program
  .command("integrate")
  .description("Route terminal tools (Claude Code, Cursor, shell scripts) through Canopy");

integrate
  .command("claude-code")
  .description("Route Claude Code through the Canopy proxy")
  .option("--write", "append the export line to your shell profile")
  .option("--check", "verify ANTHROPIC_BASE_URL is set in the current shell")
  .action((opts: ClaudeCodeOptions) => run(() => integrateClaudeCode(opts)));

integrate
  .command("cursor")
  .description("Route Cursor through the Canopy proxy")
  .action(() => run(integrateCursor));

integrate
  .command("shell")
  .description("Print env vars + helper function for any OpenAI/Anthropic script")
  .action(() => run(integrateShell));

program
  .command("config")
  .description("Interactive configuration wizard (~/.promptlens/config.json)")
  .action(() => run(configCommand));

program
  .command("open")
  .description("Open the Canopy dashboard in your browser")
  .action(() =>
    run(async () => {
      const url = `${proxyUrl()}/dashboard`;
      await open(url);
      console.log(`Opened ${url}`);
    })
  );

program.parseAsync(process.argv);
