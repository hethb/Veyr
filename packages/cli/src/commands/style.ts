// `veyr style` — toggle the on-device prompt-style learning + `veyr compose`
// completions feature. Off by default: the background corpus scanner and
// `GET /style/complete` both stay inert until this is turned on, and it's
// deliberately file-only, same trust model as `veyr rules` — no daemon
// involvement needed to flip the toggle itself.

import chalk from "chalk";
import { readPromptStyleLearning, writeConfigKey } from "../veyr/config.js";

export async function styleStatusCommand(): Promise<void> {
  const enabled = readPromptStyleLearning();
  console.log(
    enabled
      ? chalk.green("promptStyleLearning: ON") +
          chalk.dim("  — the Veyr desktop app learns from local prompt history and `veyr compose` shows suggestions")
      : chalk.dim("promptStyleLearning: OFF") + chalk.dim("  — run `veyr style enable` to turn it on")
  );
}

function setEnabled(enabled: boolean): void {
  writeConfigKey("promptStyleLearning", enabled);
  console.log(chalk.green(`✓ promptStyleLearning ${enabled ? "ON" : "OFF"}`));
  console.log(
    chalk.dim(
      enabled
        ? "  Corpus building runs in the Veyr desktop app — its next tick starts learning from your prompt history. `veyr compose` works either way, with suggestions once the app has run."
        : "  The desktop app's next tick stops scanning; `veyr compose` still works, just without suggestions."
    )
  );
}

export async function styleEnableCommand(): Promise<void> {
  setEnabled(true);
}

export async function styleDisableCommand(): Promise<void> {
  setEnabled(false);
}
