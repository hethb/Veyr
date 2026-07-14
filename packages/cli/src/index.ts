#!/usr/bin/env node
// Veyr terminal CLI — monitor LLM costs from your terminal.

import { createRequire } from "node:module";
import { Command } from "commander";
import open from "open";
import { run, proxyUrl } from "./api.js";
import { configCommand } from "./commands/configCmd.js";
import { integrateCursor, integrateShell } from "./commands/integrate.js";
import { initCommand } from "./commands/init.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("veyr")
  .description("Veyr terminal CLI — monitor LLM costs from your terminal")
  .version(version);

program
  .command("init")
  .description("Interactive setup — connect to a proxy and pick an integration")
  .action(() => run(initCommand));

const integrate = program
  .command("integrate")
  .description("Route terminal tools (Claude Code, Cursor, shell scripts) through Veyr");

integrate
  .command("cursor")
  .description("Route Cursor through the Veyr proxy")
  .action(() => run(integrateCursor));

integrate
  .command("shell")
  .description("Print env vars + helper function for any OpenAI/Anthropic script")
  .action(() => run(integrateShell));

program
  .command("config")
  .description("Interactive configuration wizard (~/.veyr/config.json)")
  .action(() => run(configCommand));

program
  .command("open")
  .description("Open the Veyr dashboard in your browser")
  .action(() =>
    run(async () => {
      const url = `${proxyUrl()}/dashboard`;
      await open(url);
      console.log(`Opened ${url}`);
    })
  );

program.parseAsync(process.argv);
