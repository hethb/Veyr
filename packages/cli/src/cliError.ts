// Shared error type + top-level command runner. Extracted from the old
// proxy-backed api.ts, minus everything proxy-specific.

import chalk from "chalk";

export class CliError extends Error {}

/** Top-level runner: prints friendly errors and exits non-zero. */
export async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof CliError) {
      console.error(err.message);
    } else {
      console.error(chalk.red("✗ Unexpected error:"), err);
    }
    process.exitCode = 1;
  }
}
