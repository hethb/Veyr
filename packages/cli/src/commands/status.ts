import chalk from "chalk";
import { apiGet, isProxyHealthy, proxyUrl, AuthError, type Overview, type TagStat } from "../api.js";
import { divider, fmtUsd, plural } from "../ui.js";

export async function statusCommand(version: string): Promise<void> {
  console.log(chalk.bold(`Canopy v${version}`));
  console.log(divider());

  let overview: Overview | null = null;
  let topTags: TagStat[] = [];
  let authBlocked = false;
  try {
    overview = await apiGet<Overview>("/api/stats/overview");
    topTags = await apiGet<TagStat[]>("/api/stats/by-tag?period=1d");
  } catch (err) {
    if (err instanceof AuthError) authBlocked = true;
    // otherwise fall through — the /health probe below decides up vs. down
  }

  const healthy = overview !== null || (await isProxyHealthy());
  const statusDot = healthy ? chalk.green("● Running") : chalk.red("● Unreachable");
  console.log(`Proxy:    ${proxyUrl()} ${statusDot}`);

  if (healthy && overview === null) {
    console.log(divider());
    if (authBlocked) {
      console.log("The proxy is up, but its stats API requires a dashboard sign-in.");
      console.log("Hosted proxies are managed from the web dashboard — open it in your browser.");
      console.log(chalk.dim("CLI stats work against local proxies (desktop app or npm run dev:proxy)."));
    } else {
      console.log(chalk.yellow("The proxy is up but its stats API returned an error."));
    }
    return;
  }

  if (!overview) {
    console.log(divider());
    console.log(chalk.red(`✗ Cannot connect to Canopy proxy at ${proxyUrl()}`));
    console.log("  Start the proxy with: npm run dev:proxy");
    console.log("  Or open the Canopy desktop app");
    process.exitCode = 1;
    return;
  }

  const line = (label: string, b: { cost: number; requests: number }): void => {
    console.log(
      `${label.padEnd(10)}${fmtUsd(b.cost).padEnd(10)}(${plural(b.requests, "request")})`
    );
  };
  line("Today:", overview.today);
  line("Week:", overview.week);
  line("Month:", overview.month);
  console.log(divider());

  if (topTags.length > 0) {
    console.log("Top features today:");
    for (const t of topTags.slice(0, 5)) {
      console.log(
        `  ${t.feature_tag.padEnd(16)}${fmtUsd(t.cost).padEnd(10)}${plural(t.requests, "request")}`
      );
    }
    console.log(divider());
  }

  console.log(chalk.dim('Run "canopy suggestions" to see optimization tips'));
}
