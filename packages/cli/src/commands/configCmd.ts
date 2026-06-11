import chalk from "chalk";
import inquirer from "inquirer";
import { CONFIG_PATH, loadConfig, saveConfig } from "../config.js";

export async function configCommand(): Promise<void> {
  const current = loadConfig();

  const answers = await inquirer.prompt<{
    proxyUrl: string;
    apiKey: string;
    defaultFeatureTag: string;
  }>([
    {
      type: "input",
      name: "proxyUrl",
      message: "Proxy URL",
      default: current.proxyUrl,
    },
    {
      type: "input",
      name: "apiKey",
      message: "API key",
      default: current.apiKey ?? "",
    },
    {
      type: "input",
      name: "defaultFeatureTag",
      message: "Default feature tag",
      default: current.defaultFeatureTag,
    },
  ]);

  saveConfig({
    proxyUrl: answers.proxyUrl.trim().replace(/\/+$/, "") || current.proxyUrl,
    apiKey: answers.apiKey.trim() || undefined,
    defaultFeatureTag: answers.defaultFeatureTag.trim() || "untagged",
  });

  console.log();
  console.log(chalk.green(`✓ Config saved to ${CONFIG_PATH}`));
}
