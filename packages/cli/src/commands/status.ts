// `veyr status` — usage/cost snapshot. Prefers the live daemon the menu bar
// app hosts while running, falling back to ~/.veyr/agent-status/VEYR_STATUS.json
// when it isn't reachable. Replaces the old proxy-backed `status`/`logs` commands.

import chalk from "chalk";
import { readStatus, type VeyrRecommendation, type VeyrStatusResult } from "../veyr/status.js";
import { alertBadge, divider, fmtUsd, freshnessLine, plural } from "../ui.js";

function renderRecommendation(rec: VeyrRecommendation): string {
  const title: string =
    rec.action === "switch_model"
      ? `Switch to ${rec.suggested_model ?? "a smaller model"}`
      : rec.action === "compact_context"
        ? "Run /compact"
        : rec.action.replace(/_/g, " ");
  const savings = rec.estimated_savings_per_hour_usd > 0
    ? chalk.dim(` (~${fmtUsd(rec.estimated_savings_per_hour_usd)}/hr)`)
    : "";
  return `  - ${title} — ${rec.reason}${savings}`;
}

function render(result: VeyrStatusResult, now: Date): void {
  console.log(freshnessLine(result.kind, "generatedAt" in result ? result.generatedAt : undefined, now));

  if (result.kind === "missing") {
    console.log(chalk.dim("  It writes ~/.veyr/agent-status/VEYR_STATUS.json every 30s during a session."));
    return;
  }

  const { status } = result;
  console.log();

  const session = status.current_session;
  if (session?.is_active) {
    console.log(chalk.bold(`${session.project}`) + chalk.dim(`  (${session.model})`));
    console.log(
      `  ${fmtUsd(session.session_cost_usd)} this session · ` +
        `$${session.cost_per_minute.toFixed(3)}/min · ` +
        `${Math.round(session.cache_hit_rate * 100)}% cache hit`
    );
    console.log(
      chalk.dim(
        `  ${session.input_tokens.toLocaleString()}↓ ${session.output_tokens.toLocaleString()}↑ · ` +
          `${session.session_duration_minutes.toFixed(1)}m elapsed`
      )
    );
  } else {
    console.log(chalk.dim("  No active session."));
  }

  if (typeof status.today_spent_usd === "number") {
    console.log(`  Today: ${fmtUsd(status.today_spent_usd)} across all sessions`);
  }

  const { budget } = status;
  if (budget.project_monthly_cap_usd || budget.global_monthly_cap_usd) {
    console.log();
    console.log(chalk.bold("Budget"));
    if (budget.project_monthly_cap_usd) {
      console.log(
        `  Project: ${fmtUsd(budget.project_spent_this_month_usd)} / ` +
          `${fmtUsd(budget.project_monthly_cap_usd)} ` +
          chalk.dim(`(${budget.project_pct_used ?? 0}%)`)
      );
    }
    if (budget.global_monthly_cap_usd) {
      console.log(
        `  Global:  ${fmtUsd(budget.global_spent_this_month_usd)} / ` +
          `${fmtUsd(budget.global_monthly_cap_usd)} ` +
          chalk.dim(`(${budget.global_pct_used ?? 0}%)`)
      );
    }
  }

  if (status.alerts.length > 0) {
    console.log();
    console.log(chalk.bold(plural(status.alerts.length, "alert")));
    for (const alert of status.alerts) {
      console.log(`  ${alertBadge(alert.level)}  ${alert.message}`);
    }
  }

  if (status.recommendations.length > 0) {
    console.log();
    console.log(chalk.bold("Recommendations"));
    for (const rec of status.recommendations.slice(0, 5)) {
      console.log(renderRecommendation(rec));
    }
  }

  const tools = status.tool_analysis;
  const quality = status.tool_quality;
  if (quality?.analyzed) {
    console.log();
    console.log(chalk.bold("Tool health"));
    if (tools) {
      console.log(
        `  ${tools.tools_used} of ~${tools.tools_loaded} known tools used this session` +
          (tools.unused_tool_token_estimate > 0
            ? chalk.dim(` · unused definitions ≈ ${tools.unused_tool_token_estimate} tokens/turn`)
            : "")
      );
    }
    if (quality.flagged_tools.length === 0) {
      console.log(
        chalk.dim("  No vague tool names detected. (Descriptions aren't visible in local logs, so only names are checked.)")
      );
    } else {
      for (const tool of quality.flagged_tools) {
        console.log(
          `  ${chalk.yellow(tool.name)}  ${chalk.dim(`${tool.issue.replace(/_/g, " ")} — ${tool.suggestion}`)}`
        );
      }
    }
  }

  const complexity = status.complexity;
  if (complexity?.classifier_enabled) {
    console.log();
    console.log(chalk.bold("Complexity"));
    console.log(
      `  ${complexity.classified_turns_this_month.toLocaleString()} turns classified this month · ` +
        `${complexity.simple_on_frontier_pct}% simple tasks on a frontier model` +
        (complexity.wasted_cost_this_month_usd > 0
          ? chalk.dim(` (~${fmtUsd(complexity.wasted_cost_this_month_usd)} avoidable)`)
          : "")
    );
  }

  const graph = status.graph_context;
  if (graph?.available) {
    console.log();
    console.log(
      chalk.dim(
        `Graph: ${graph.file_count} files, ${graph.node_count} symbols` +
          `${graph.is_partial ? " (partial)" : ""} — run \`veyr graph\` for detail`
      )
    );
  }
}

export async function statusCommand(opts: { watch?: boolean; json?: boolean }): Promise<void> {
  if (opts.json) {
    const result = await readStatus();
    console.log(JSON.stringify(result.kind === "missing" ? result : result.status, null, 2));
    return;
  }

  if (!opts.watch) {
    render(await readStatus(), new Date());
    return;
  }

  console.log(divider());
  console.log(chalk.dim("watching — polling every 3s, not a live event stream. Ctrl-C to stop."));
  console.log(divider());
  const poll = async (): Promise<void> => {
    const result = await readStatus();
    console.clear();
    render(result, new Date());
  };
  await poll();
  const timer = setInterval(() => void poll(), 3000);
  process.on("SIGINT", () => {
    clearInterval(timer);
    process.exit(0);
  });
  await new Promise(() => {
    // runs until Ctrl-C
  });
}
