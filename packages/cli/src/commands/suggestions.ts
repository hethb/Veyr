import chalk from "chalk";
import { apiGet, type Suggestion } from "../api.js";
import { fmtUsd, severityBadge } from "../ui.js";

/**
 * Maps a suggestion to the exact `canopy policy set` command that acts on
 * it, when one exists for its category.
 */
function actionCommand(s: Suggestion): string | null {
  const tag = typeof s.evidence.feature_tag === "string" ? s.evidence.feature_tag : null;
  if (!tag) return null;

  switch (s.category) {
    case "model":
      return `canopy policy set ${tag} --model gpt-4o-mini`;
    case "caching":
      return `canopy policy set ${tag} --cache true`;
    case "volume": {
      const monthly = typeof s.evidence.monthly_cost === "number" ? s.evidence.monthly_cost : null;
      const budget = monthly ? Math.max(1, Math.ceil(monthly)) : 50;
      return `canopy policy set ${tag} --budget ${budget}`;
    }
    case "token-waste": {
      const avg =
        typeof s.evidence.avg_completion_tokens === "number"
          ? s.evidence.avg_completion_tokens
          : null;
      if (avg === null) return null; // template-compression rule — no policy lever
      const cap = Math.max(128, Math.ceil((avg * 1.2) / 128) * 128);
      return `canopy policy set ${tag} --max-tokens ${cap}`;
    }
    default:
      return null;
  }
}

export async function suggestionsCommand(): Promise<void> {
  const suggestions = await apiGet<Suggestion[]>("/api/analysis/suggestions");

  if (suggestions.length === 0) {
    console.log(chalk.green("✓ No optimization suggestions — your usage looks efficient."));
    return;
  }

  const totalSavings = suggestions.reduce((sum, s) => sum + (s.impact_usd || 0), 0);
  console.log(
    chalk.bold(
      `${suggestions.length} optimization suggestion${suggestions.length === 1 ? "" : "s"}`
    ) + chalk.dim(`  (estimated savings: ${fmtUsd(totalSavings)}/month)`)
  );
  console.log(chalk.dim("─".repeat(62)));
  console.log();

  const order = { high: 0, medium: 1, low: 2 } as const;
  const sorted = [...suggestions].sort(
    (a, b) => order[a.severity] - order[b.severity] || b.impact_usd - a.impact_usd
  );

  for (const s of sorted) {
    const savings = s.impact_usd > 0 ? `Save ~${fmtUsd(s.impact_usd)}/mo` : "";
    console.log(`${severityBadge(s.severity)}  ${chalk.bold(savings)}`);
    console.log(`   ${chalk.bold(s.title)}`);
    console.log(`   ${s.description}`);
    console.log(`   ${chalk.dim("Action:")} ${s.action}`);
    const cmd = actionCommand(s);
    if (cmd) console.log(`   ${chalk.cyan("→ Run:")} ${chalk.cyan(cmd)}`);
    console.log();
  }
}
