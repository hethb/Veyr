// `veyr init` / `npx getcanopy init` — zero-friction onboarding.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import fetch from "node-fetch";
import { CONFIG_PATH, saveConfig } from "../config.js";
import { type ApiKeyRow } from "../api.js";
import { integrateClaudeCode } from "./integrate.js";
import { integrateCursor } from "./integrate.js";
import { integrateShell } from "./integrate.js";

const DEFAULT_LOCAL_URL = "http://localhost:3001";

async function isHealthy(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body?.status === "ok";
  } catch {
    return false;
  }
}

/**
 * Best-effort local proxy start: works when the CLI runs inside the
 * Veyr monorepo (dev / git clone). npm-installed users are pointed at
 * the desktop app instead.
 */
function findProxyEntry(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", "..", "..", "proxy", "dist", "index.js"), // dist/commands -> packages/proxy
    resolve(process.cwd(), "packages", "proxy", "dist", "index.js"),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

async function startLocalProxy(): Promise<boolean> {
  const entry = findProxyEntry();
  if (!entry) return false;

  const child = spawn(process.execPath, [entry], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PORT: "3001", VEYR_ALLOW_ANON: "true" },
  });
  child.unref();

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await isHealthy(DEFAULT_LOCAL_URL)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function verifyKey(baseUrl: string, key: string): Promise<boolean | null> {
  // No dedicated verify endpoint — match the key's stored prefix via
  // /api/keys. Only conclusive on local/no-auth proxies; null = unknown.
  try {
    const res = await fetch(`${baseUrl}/api/keys`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const keys = (await res.json()) as ApiKeyRow[];
    return keys.some((k) => key.startsWith(k.key_prefix));
  } catch {
    return null;
  }
}

function showSdkSnippet(kind: "openai" | "anthropic", baseUrl: string, apiKey?: string): void {
  const fn = kind === "openai" ? "veyrOpenAI" : "veyrAnthropic";
  const client = kind === "openai" ? "OpenAI" : "Anthropic";
  const envKey = kind === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
  const plKey = apiKey ? `, veyrKey: "${apiKey}"` : "";
  console.log();
  console.log(chalk.dim("// npm install canopy-sdk"));
  console.log(chalk.cyan(`import { ${fn} } from "canopy-sdk";`));
  console.log(
    chalk.cyan(
      `const client = new ${client}(${fn}({ apiKey: process.env.${envKey}!, baseUrl: "${baseUrl}"${plKey} }));`
    )
  );
  console.log();
  console.log(chalk.dim("Every call through this client is now logged to Veyr."));
}

export async function initCommand(): Promise<void> {
  console.log();
  console.log(chalk.bold("Welcome to Veyr 👋"));
  console.log();
  console.log("Let's get you set up in 60 seconds.");
  console.log();

  // -------------------------------------------------------------- mode
  const { mode } = await inquirer.prompt<{ mode: "local" | "hosted" }>([
    {
      type: "list",
      name: "mode",
      message: "How do you want to run Veyr?",
      choices: [
        { name: "Local (proxy running on this machine)", value: "local" },
        { name: "Hosted (connect to a deployed proxy URL)", value: "hosted" },
      ],
    },
  ]);

  let baseUrl = DEFAULT_LOCAL_URL;

  if (mode === "hosted") {
    const { url } = await inquirer.prompt<{ url: string }>([
      {
        type: "input",
        name: "url",
        message: "Proxy URL",
        validate: (v: string) =>
          /^https?:\/\/.+/.test(v.trim()) || "Enter a full URL (e.g. https://veyr.example.com)",
      },
    ]);
    baseUrl = url.trim().replace(/\/+$/, "");

    const spinner = ora(`Checking ${baseUrl} ...`).start();
    if (await isHealthy(baseUrl)) {
      spinner.succeed(`Connected to ${baseUrl}`);
    } else {
      spinner.warn(`Could not reach ${baseUrl}/health — continuing anyway.`);
    }
  } else {
    if (await isHealthy(baseUrl)) {
      console.log(chalk.green(`✓ Proxy already running on ${baseUrl}`));
    } else {
      const { startNow } = await inquirer.prompt<{ startNow: boolean }>([
        {
          type: "confirm",
          name: "startNow",
          message: `No proxy detected on ${baseUrl}. Start one now?`,
          default: true,
        },
      ]);
      if (startNow) {
        const spinner = ora("Starting proxy...").start();
        if (await startLocalProxy()) {
          spinner.succeed(`Proxy running on ${baseUrl}`);
        } else {
          spinner.fail("Couldn't start the proxy from here.");
          console.log("  Start it with: npm run dev:proxy   (in the Veyr repo)");
          console.log("  Or open the Veyr desktop app — it manages the proxy for you.");
        }
      }
    }
  }

  // -------------------------------------------------------------- API key
  const { apiKey } = await inquirer.prompt<{ apiKey: string }>([
    {
      type: "input",
      name: "apiKey",
      message: "Your Veyr API key (leave blank to use demo mode):",
    },
  ]);
  const trimmedKey = apiKey.trim();

  if (!trimmedKey) {
    console.log(chalk.dim("  Using demo mode — key-less requests are logged to the shared anon key."));
  } else {
    const ok = await verifyKey(baseUrl, trimmedKey);
    if (ok === true) console.log(chalk.green("✓ Key verified"));
    else if (ok === false) console.log(chalk.yellow("⚠ Key not recognized by this proxy — saved anyway."));
    else console.log(chalk.dim("  Couldn't verify the key against this proxy — saved anyway."));
  }

  saveConfig({
    proxyUrl: baseUrl,
    apiKey: trimmedKey || undefined,
    defaultFeatureTag: "untagged",
  });
  console.log(chalk.dim(`  Config saved to ${CONFIG_PATH}`));
  console.log();

  // -------------------------------------------------------------- integration
  const { integration } = await inquirer.prompt<{
    integration: "openai" | "anthropic" | "claude-code" | "cursor" | "env";
  }>([
    {
      type: "list",
      name: "integration",
      message: "Which integration do you want to set up?",
      choices: [
        { name: "OpenAI SDK (add to my code)", value: "openai" },
        { name: "Anthropic SDK (add to my code)", value: "anthropic" },
        { name: "Claude Code CLI", value: "claude-code" },
        { name: "Cursor", value: "cursor" },
        { name: "Just show me the env vars", value: "env" },
      ],
    },
  ]);

  console.log();
  switch (integration) {
    case "openai":
      showSdkSnippet("openai", baseUrl, trimmedKey || undefined);
      break;
    case "anthropic":
      showSdkSnippet("anthropic", baseUrl, trimmedKey || undefined);
      break;
    case "claude-code":
      await integrateClaudeCode({});
      break;
    case "cursor":
      await integrateCursor();
      break;
    case "env":
      await integrateShell();
      break;
  }

  // -------------------------------------------------------------- done
  console.log();
  console.log(chalk.green.bold("✓ Setup complete!"));
  console.log(`  Dashboard: ${baseUrl}`);
  console.log('  Run "veyr status" to see your spend');
  console.log('  Run "veyr suggestions" to get optimization tips');
}
