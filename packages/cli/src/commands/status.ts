import chalk from "chalk";
import { apiGet, proxyUrl, type Overview, type TagStat } from "../api.js";
import { divider, fmtUsd, plural } from "../ui.js";

export async function statusCommand(version: string): Promise<void> {
  console.log(chalk.bold(`Canopy v${version}`));
  console.log(divider());

  let overview: Overview | null = null;
  let topTags: TagStat[] = [];
  let healthy = false;
  try {
    overview = await apiGet<Overview>("/api/stats/overview");
    topTags = await apiGet<TagStat[]>("/api/stats/by-tag?period=1d");
    healthy = true;
  } catch {
    // fall through to the unreachable rendering below
  }

  const statusDot = healthy ? chalk.green("● Running") : chalk.red("● Unreachable");
  console.log(`Proxy:    ${proxyUrl()} ${statusDot}`);

  if (!healthy || !overview) {
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
