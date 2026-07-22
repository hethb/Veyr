// `veyr usage` — per-agent spend breakdown, mirroring the Mac app's Spend
// window: today/week/month summary, by agent (provider · model), by project
// (feature tag), last-7-days bars, and the recent-session timeline. Prefers
// the daemon's /sessions (app-priced); falls back to pricing
// ~/.veyr/cache/sessions.json CLI-side (see veyr/sessions.ts for the caveat).

import chalk from "chalk";
import {
  groupBy,
  last7Days,
  readSessions,
  startOfMonth,
  startOfToday,
  startOfWeek,
  totalSince,
  type CliSessionEntry,
  type SessionsResult,
  type SpendBucket,
} from "../veyr/sessions.js";
import { bar, fmtSessionStamp, fmtTokens, fmtUsd, plural, renderColumns, sectionTitle } from "../ui.js";

function sourceLine(kind: "daemon" | "cache"): string {
  return kind === "daemon"
    ? chalk.green("● live") + chalk.dim(" · sessions priced by the Veyr app")
    : chalk.cyan("● local") +
        chalk.dim(" · scanned your agent logs directly, priced with built-in rates");
}

function cacheHitPct(bucket: SpendBucket): string {
  const denominator = bucket.inputTokens + bucket.cacheReadTokens;
  if (denominator <= 0) return "—";
  return `${Math.round((bucket.cacheReadTokens / denominator) * 100)}%`;
}

function bucketRow(label: string, bucket: SpendBucket): string[] {
  return [
    label,
    chalk.bold(fmtUsd(bucket.costUSD)),
    plural(bucket.sessionCount, "session"),
    chalk.dim(`${fmtTokens(bucket.inputTokens)}↓ ${fmtTokens(bucket.outputTokens)}↑`),
    chalk.dim(`${cacheHitPct(bucket)} cache hit`),
  ];
}

function renderSummary(sessions: readonly CliSessionEntry[], now: Date): void {
  console.log(sectionTitle("Spend"));
  const rows = [
    bucketRow("Today", totalSince(sessions, startOfToday(now))),
    bucketRow("This week", totalSince(sessions, startOfWeek(now))),
    bucketRow("This month", totalSince(sessions, startOfMonth(now))),
  ];
  for (const line of renderColumns(rows, { rightAlign: [1] })) console.log(line);
}

function renderGroup(
  title: string,
  sessions: readonly CliSessionEntry[],
  sinceMs: number,
  keyOf: (session: CliSessionEntry) => string,
  limit: number
): void {
  const groups = groupBy(sessions, sinceMs, keyOf);
  if (groups.length === 0) return;
  console.log(sectionTitle(title) + chalk.dim("  (this month)"));
  const rows = groups.slice(0, limit).map(({ key, bucket }) => bucketRow(key, bucket));
  for (const line of renderColumns(rows, { rightAlign: [1] })) console.log(line);
  if (groups.length > limit) {
    console.log(chalk.dim(`  … and ${groups.length - limit} more`));
  }
}

function renderWeekBars(sessions: readonly CliSessionEntry[], now: Date): void {
  const days = last7Days(sessions, now);
  const max = Math.max(...days.map((d) => d.costUSD));
  if (max <= 0) return;
  console.log(sectionTitle("Last 7 days"));
  const rows = days.map((day) => [
    new Date(day.dayStartMs).toLocaleDateString("en-US", { weekday: "short" }),
    bar(day.costUSD, max),
    chalk.dim(fmtUsd(day.costUSD)),
  ]);
  for (const line of renderColumns(rows)) console.log(line);
}

function renderTimeline(sessions: readonly CliSessionEntry[], count: number, now: Date): void {
  if (sessions.length === 0) return;
  console.log(sectionTitle("Recent sessions"));
  const rows = sessions.slice(0, count).map((session) => {
    const flags =
      (session.usage.costUSD > 1.0 ? chalk.yellow("⚠ ") : "") +
      (session.usage.inputTokens + session.usage.cacheReadTokens > 0 &&
      session.usage.cacheReadTokens / (session.usage.inputTokens + session.usage.cacheReadTokens) > 0.3
        ? "⚡"
        : "");
    return [
      fmtSessionStamp(session.timestampMs, now),
      chalk.dim(`${session.provider} · ${session.modelId.slice(0, 20)}`),
      session.featureTag,
      chalk.bold(fmtUsd(session.usage.costUSD)),
      chalk.dim(`${fmtTokens(session.usage.inputTokens)}↓ ${fmtTokens(session.usage.outputTokens)}↑`),
      flags,
    ];
  });
  for (const line of renderColumns(rows, { rightAlign: [3] })) console.log(line);
  if (sessions.length > count) {
    console.log(chalk.dim(`  … ${sessions.length - count} older — \`veyr usage --sessions ${sessions.length}\` for all`));
  }
}

export async function usageCommand(opts: { json?: boolean; sessions?: string }): Promise<void> {
  const result: SessionsResult = await readSessions();

  if (opts.json) {
    console.log(JSON.stringify(result.kind === "missing" ? result : result.sessions, null, 2));
    return;
  }

  if (result.kind === "missing") {
    console.log(chalk.dim("○ no session data yet — no Claude Code or Codex logs found on this machine."));
    return;
  }

  const now = new Date();
  console.log(sourceLine(result.kind));

  renderSummary(result.sessions, now);
  renderGroup(
    "By agent",
    result.sessions,
    startOfMonth(now),
    (session) => `${session.provider} · ${session.modelId}`,
    8
  );
  renderGroup("By project", result.sessions, startOfMonth(now), (session) => session.featureTag, 8);
  renderWeekBars(result.sessions, now);

  const count = Math.max(1, Number.parseInt(opts.sessions ?? "8", 10) || 8);
  renderTimeline(result.sessions, count, now);
}
