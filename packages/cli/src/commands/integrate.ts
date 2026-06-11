// `promptlens integrate <tool>` — route terminal tools through the proxy.

import { accessSync, constants, existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";
import { proxyUrl } from "../api.js";

const MARKER = "# Added by `promptlens integrate claude-code --write`";

function findInPath(bin: string): string | null {
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, bin + ext);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // not here — keep scanning
      }
    }
  }
  return null;
}

function shellProfile(): string {
  const shell = process.env.SHELL ?? "";
  return join(homedir(), shell.includes("zsh") ? ".zshrc" : ".bashrc");
}

// ---------------------------------------------------------------------------
// claude-code
// ---------------------------------------------------------------------------
export interface ClaudeCodeOptions {
  write?: boolean;
  check?: boolean;
}

export async function integrateClaudeCode(opts: ClaudeCodeOptions): Promise<void> {
  // Claude Code's SDK appends /v1/messages itself, so the base URL must NOT
  // include /v1 — this matches the proxy's /anthropic/v1/messages route.
  const anthropicBase = `${proxyUrl()}/anthropic`;
  const exportLine = `export ANTHROPIC_BASE_URL=${anthropicBase}`;

  if (opts.check) {
    const current = process.env.ANTHROPIC_BASE_URL ?? "";
    if (current === anthropicBase) {
      console.log(chalk.green("✓ ANTHROPIC_BASE_URL is set — Claude Code routes through PromptLens."));
    } else if (current) {
      console.log(chalk.yellow(`⚠ ANTHROPIC_BASE_URL is set to ${current}, expected ${anthropicBase}`));
      process.exitCode = 1;
    } else {
      console.log(
        chalk.red("✗ ANTHROPIC_BASE_URL is not set in this shell.") +
          "\n  Did you run: source " + shellProfile() + " ?"
      );
      process.exitCode = 1;
    }
    return;
  }

  const claudePath = findInPath("claude");
  if (claudePath) {
    console.log(chalk.green(`✓ Claude Code detected at ${claudePath}`));
  } else {
    console.log(chalk.yellow("⚠ `claude` not found in PATH — instructions below still apply once it's installed."));
  }
  console.log();

  if (!opts.write) {
    console.log("To route Claude Code through PromptLens, add this to your shell profile:");
    console.log();
    console.log(`  ${chalk.cyan(exportLine)}`);
    console.log(`  ${chalk.dim("export ANTHROPIC_API_KEY=<your-anthropic-key>  # unchanged")}`);
    console.log();
    console.log("Or run this command to append it automatically:");
    console.log(`  ${chalk.cyan("promptlens integrate claude-code --write")}`);
  } else {
    const profile = shellProfile();
    const existing = existsSync(profile) ? readFileSync(profile, "utf8") : "";
    if (existing.includes(MARKER)) {
      console.log(chalk.yellow(`⚠ ${profile} already contains the PromptLens block — nothing to do.`));
    } else {
      appendFileSync(profile, `\n${MARKER}\n${exportLine}\n`, "utf8");
      console.log(chalk.green(`✓ Added to ${profile}.`) + ` Run: source ${profile}`);
    }
    console.log(
      chalk.dim("Then verify with: ") + chalk.cyan("promptlens integrate claude-code --check")
    );
  }

  console.log();
  console.log(
    chalk.dim(
      "Claude Code will now appear in your PromptLens dashboard under the feature tag\n" +
        '"claude-code-cli". You can change this with: promptlens policy set claude-code-cli'
    )
  );
}

// ---------------------------------------------------------------------------
// cursor
// ---------------------------------------------------------------------------
function cursorSettingsPath(): string {
  switch (process.platform) {
    case "darwin":
      return join(homedir(), "Library", "Application Support", "Cursor", "User", "settings.json");
    case "win32":
      return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "Cursor", "User", "settings.json");
    default:
      return join(homedir(), ".config", "Cursor", "User", "settings.json");
  }
}

export async function integrateCursor(): Promise<void> {
  const openaiBase = `${proxyUrl()}/openai/v1`;

  console.log("To route Cursor through PromptLens:");
  console.log();
  console.log("  1. Open Cursor Settings → Models → OpenAI API Key");
  console.log(`  2. Set "Override OpenAI Base URL" to: ${chalk.cyan(openaiBase)}`);
  console.log(`  3. Your Cursor usage will appear in PromptLens under the tag ${chalk.cyan('"cursor"')}`);
  console.log();

  const settingsPath = cursorSettingsPath();
  if (!existsSync(settingsPath)) {
    console.log(chalk.dim(`Cursor settings not found at ${settingsPath} — set it manually as above.`));
    return;
  }

  const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
    {
      type: "confirm",
      name: "confirm",
      message: `Cursor settings found at ${settingsPath}\n  Automatically update "openai.apiBaseUrl"?`,
      default: true,
    },
  ]);
  if (!confirm) {
    console.log(chalk.dim("Skipped — set it manually in Cursor Settings."));
    return;
  }

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8")) as Record<string, unknown>;
  } catch {
    console.log(
      chalk.yellow("⚠ Could not parse Cursor settings.json (comments/trailing commas?).") +
        "\n  Please set it manually in Cursor Settings as shown above."
    );
    return;
  }

  settings["openai.apiBaseUrl"] = openaiBase;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  console.log(chalk.green(`✓ Updated "openai.apiBaseUrl" in ${settingsPath}`));
  console.log(chalk.dim("Restart Cursor for the change to take effect."));
}

// ---------------------------------------------------------------------------
// shell
// ---------------------------------------------------------------------------
export async function integrateShell(): Promise<void> {
  const base = proxyUrl();
  console.log("# Add to your ~/.zshrc or ~/.bashrc");
  console.log(chalk.cyan(`export OPENAI_BASE_URL="${base}/openai/v1"`));
  console.log(chalk.cyan(`export ANTHROPIC_BASE_URL="${base}/anthropic"`));
  console.log();
  console.log("# Optional: tag requests by project (read by the PromptLens SDK)");
  console.log(chalk.cyan("pl-tag() {"));
  console.log(chalk.cyan('  export PROMPTLENS_FEATURE_TAG="$1"'));
  console.log(chalk.cyan('  echo "✓ PromptLens feature tag set to: $1"'));
  console.log(chalk.cyan("}"));
  console.log();
  console.log(
    chalk.dim(
      "Tools that can't send custom headers are tagged automatically from their\n" +
        "User-Agent (claude-code-cli, cursor, python-script, node-script)."
    )
  );
}
