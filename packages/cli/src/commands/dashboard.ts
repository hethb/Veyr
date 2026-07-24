// `veyr` (no args) / `veyr dashboard` — one formatted overview screen of
// everything the other commands cover: current session, spend across agents,
// Graphify status, savings, guidance-rule state, plus the full command list
// so nobody needs the README to discover a command. Terminal output only —
// this is deliberately NOT a hosted dashboard, a web view, or anything that
// opens a browser; Veyr's "no dashboard" positioning refers to those.
//
// Also rendered once as a welcome/orientation screen on the CLI's very first
// run (see the first-run hook in index.ts and veyr/cliState.ts).

import chalk from "chalk";
import { readAutoUpdateGuidance, readSavingsTracker } from "@veyr/core";
import { readGraphCache } from "@veyr/core";
import { readRules } from "@veyr/core";
import { readSavingsStore, totalUsd } from "@veyr/core";
import { readSessions, startOfMonth, startOfToday, startOfWeek, totalSince, groupBy } from "@veyr/core";
import { readStatus } from "@veyr/core";
import { divider, fmtAge, fmtTokens, fmtUsd, plural, renderColumns, sectionTitle } from "../ui.js";

const COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ["veyr", "This dashboard"],
  ["veyr status", "Current session cost, today's spend, budget, alerts, tool health"],
  ["veyr status --watch", "Same, re-rendering every 3s"],
  ["veyr usage", "Per-agent/per-project spend breakdown and session timeline"],
  ["veyr graph", "Graphify graph status + what Veyr understands about the project"],
  ["veyr graph --refresh", "On-demand rescan of the current directory"],
  ["veyr rules", "The CLAUDE.md agent-guidance rule set and injection state"],
  ["veyr rules on|off", "Toggle guidance injection (master gate, default off)"],
  ["veyr rules enable|disable <id>", "Toggle one rule"],
  ["veyr savings", "Estimated savings — lifetime + current project, confidence-tagged"],
  ["veyr savings --projects", "Savings broken down per project"],
  ["veyr savings enable|disable", "Toggle the savings tracker (default off)"],
  ["veyr compose", "Compose a prompt with style-based suggestions"],
  ["veyr style enable|disable", "Toggle on-device prompt-style learning (default off)"],
  ["veyr <command> --json", "Raw payload for status / usage / graph"],
];

// The Veyr blob mark, five rows tall, tinted top-to-bottom through the brand
// blues. Rows are exactly 15 chars wide so banner text columns line up.
const MARK: ReadonlyArray<string> = [
  "   ▄▄▄███▄▄▄   ",
  " ▄█▀       ▀█▄ ",
  "▐█           █▌",
  " ▀█▄       ▄█▀ ",
  "   ▀▀▀███▀▀▀   ",
];
const MARK_COLORS: ReadonlyArray<string> = ["#B1C5FF", "#7FB0FF", "#4FABFF", "#2E8FFF", "#076EFF"];

/** Prints the mark with `textLines` alongside, vertically offset one row. */
function renderLogo(textLines: ReadonlyArray<string>): void {
  const rows = Math.max(MARK.length, textLines.length + 1);
  for (let i = 0; i < rows; i++) {
    const mark = i < MARK.length ? chalk.hex(MARK_COLORS[i])(MARK[i]) : " ".repeat(15);
    const text = i >= 1 ? (textLines[i - 1] ?? "") : "";
    console.log(text ? `${mark}  ${text}` : mark);
  }
}

function renderWelcomeBanner(version: string): void {
  renderLogo([
    chalk.bold.cyan(`Veyr CLI v${version}`) + chalk.dim(" — first run, so here's the lay of the land."),
    chalk.dim("Everything below is computed from local data — your agent"),
    chalk.dim("logs and ~/.veyr/ — no proxy, no account, no traffic"),
    chalk.dim("interception. Reach this screen anytime with `veyr`."),
  ]);
  console.log(divider(70));
}

export async function dashboardCommand(opts: { welcome?: boolean; version: string }): Promise<void> {
  const [status, sessions, graph] = await Promise.all([readStatus(), readSessions(), readGraphCache()]);
  const now = new Date();

  if (opts.welcome) {
    renderWelcomeBanner(opts.version);
  } else {
    renderLogo([
      chalk.bold.cyan(`Veyr v${opts.version}`),
      chalk.dim("Terminal overview. Everything local."),
    ]);
  }

  // --- Session ---
  console.log(sectionTitle("Session"));
  if (status.kind === "missing") {
    console.log(chalk.dim("  No session data yet — start a Claude Code or Codex session and re-run."));
  } else {
    const session = status.status.current_session;
    if (session?.is_active) {
      console.log(
        `  ${chalk.green("●")} ${chalk.bold(session.project)} ${chalk.dim(`(${session.model})`)} — ` +
          `${chalk.bold(fmtUsd(session.session_cost_usd))} · $${session.cost_per_minute.toFixed(3)}/min · ` +
          `${Math.round(session.cache_hit_rate * 100)}% cache hit`
      );
    } else {
      console.log(chalk.dim("  ○ idle — no active session") + (status.kind === "stale" ? chalk.dim(" (feed stale)") : ""));
    }
    if (typeof status.status.today_spent_usd === "number") {
      console.log(`  Today: ${chalk.bold(fmtUsd(status.status.today_spent_usd))} across all sessions`);
    }
    const firstAlert = status.status.alerts[0];
    if (firstAlert) {
      console.log(
        `  ${chalk.yellow("⚠")} ${firstAlert.message}` +
          (status.status.alerts.length > 1 ? chalk.dim(` (+${status.status.alerts.length - 1} more — \`veyr status\`)`) : "")
      );
    }
  }

  // --- Usage across agents ---
  console.log(sectionTitle("Usage"));
  if (sessions.kind === "missing") {
    console.log(chalk.dim("  No session data yet."));
  } else {
    const today = totalSince(sessions.sessions, startOfToday(now));
    const week = totalSince(sessions.sessions, startOfWeek(now));
    const month = totalSince(sessions.sessions, startOfMonth(now));
    console.log(
      `  ${chalk.bold(fmtUsd(today.costUSD))} today · ${chalk.bold(fmtUsd(week.costUSD))} this week · ` +
        `${chalk.bold(fmtUsd(month.costUSD))} this month ${chalk.dim(`(${plural(month.sessionCount, "session")})`)}`
    );
    const agents = groupBy(sessions.sessions, startOfMonth(now), (s) => `${s.provider} · ${s.modelId}`);
    const agentRows = agents
      .slice(0, 3)
      .map(({ key, bucket }) => [
        key,
        chalk.bold(fmtUsd(bucket.costUSD)),
        chalk.dim(`${plural(bucket.sessionCount, "session")} · ${fmtTokens(bucket.outputTokens)}↑`),
      ]);
    for (const line of renderColumns(agentRows, { rightAlign: [1] })) console.log(line);
    if (agents.length > 3) console.log(chalk.dim(`  … \`veyr usage\` for the full breakdown`));
  }

  // --- Graph ---
  console.log(sectionTitle("Graph"));
  if (graph.kind === "missing") {
    console.log(chalk.dim("  No graph yet — `veyr graph --refresh` builds one for the current directory (needs Python 3.10+)."));
  } else {
    const payload = graph.payload;
    console.log(
      `  ${payload.isPartial ? chalk.yellow("◐ partial") : chalk.green("● full")} — ${payload.workspaceRoot}`
    );
    console.log(
      `  ${payload.fileCount} files · ${fmtTokens(payload.totalNodeCount)} symbols · ` +
        `${fmtTokens(payload.totalLinkCount)} links · ${chalk.dim(`scanned ${fmtAge(graph.generatedAt, now)}`)}`
    );
    const context = status.kind !== "missing" ? status.status.graph_context : undefined;
    if (context?.available && context.token_savings_estimate.savings_this_session > 0) {
      console.log(
        chalk.dim(
          `  Saving your agent ~${fmtTokens(context.token_savings_estimate.savings_this_session)} exploration tokens/session`
        )
      );
    }
  }

  // --- Savings ---
  console.log(sectionTitle("Savings"));
  if (!readSavingsTracker()) {
    console.log(chalk.dim("  Tracker off (default) — `veyr savings enable` to start. Figures are always confidence-tagged."));
  } else {
    const store = readSavingsStore();
    if (store === null) {
      console.log(chalk.dim("  Tracker on — nothing recorded yet."));
    } else {
      const projects = Object.keys(store.perProjectTotals).length;
      console.log(
        `  ${chalk.bold(fmtUsd(totalUsd(store.lifetimeTotals)))} lifetime across ${plural(projects, "project")} ` +
          chalk.dim("· `veyr savings` for the confidence breakdown")
      );
    }
  }

  // --- Guidance rules ---
  console.log(sectionTitle("Guidance rules"));
  const gateOn = readAutoUpdateGuidance();
  const ruleSet = readRules();
  const enabled = ruleSet.rules.filter((rule) => rule.enabled).length;
  console.log(
    `  Injection ${gateOn ? chalk.green("ON") : chalk.dim("OFF")} · ${enabled}/${ruleSet.rules.length} rules enabled ` +
      chalk.dim("· `veyr rules` to view, `veyr rules on|off` to toggle")
  );

  // --- Commands ---
  console.log(sectionTitle("Commands"));
  for (const line of renderColumns(
    COMMANDS.map(([cmd, blurb]) => [chalk.cyan(cmd), chalk.dim(blurb)])
  )) {
    console.log(line);
  }
}
