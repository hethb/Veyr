// `veyr integrate <tool>` — route terminal tools through the proxy.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import inquirer from "inquirer";
import { proxyUrl } from "../api.js";

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

  console.log("To route Cursor through Veyr:");
  console.log();
  console.log("  1. Open Cursor Settings → Models → OpenAI API Key");
  console.log(`  2. Set "Override OpenAI Base URL" to: ${chalk.cyan(openaiBase)}`);
  console.log(`  3. Your Cursor usage will appear in Veyr under the tag ${chalk.cyan('"cursor"')}`);
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
  console.log("# Optional: tag requests by project (read by the Veyr SDK)");
  console.log(chalk.cyan("veyr-tag() {"));
  console.log(chalk.cyan('  export VEYR_FEATURE_TAG="$1"'));
  console.log(chalk.cyan('  echo "✓ Veyr feature tag set to: $1"'));
  console.log(chalk.cyan("}"));
  console.log();
  console.log(
    chalk.dim(
      "Tools that can't send custom headers are tagged automatically from their\n" +
        "User-Agent (claude-code-cli, cursor, python-script, node-script)."
    )
  );
}
