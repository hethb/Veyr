// Shared terminal formatting. Colors are limited to chalk's standard ANSI
// palette (no explicit white/black) so output stays readable on both light
// and dark terminal themes.

import chalk from "chalk";

export function fmtUsd(n: number | null | undefined): string {
  const v = typeof n === "number" ? n : 0;
  if (v !== 0 && Math.abs(v) < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(2)}`;
}

export function fmtCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function divider(width = 37): string {
  return chalk.dim("─".repeat(width));
}

export function plural(n: number, word: string): string {
  return `${fmtCount(n)} ${word}${n === 1 ? "" : "s"}`;
}

export function severityBadge(severity: "high" | "medium" | "low"): string {
  switch (severity) {
    case "high":
      return `🔴 ${chalk.red.bold("HIGH")}`;
    case "medium":
      return `🟡 ${chalk.yellow.bold("MED ")}`;
    case "low":
      return `🔵 ${chalk.blue.bold("LOW ")}`;
  }
}

/** Alert levels are a separate vocabulary from recommendation severity
 * ("warning"/"critical" vs "high"/"medium"/"low") — distinct badge. */
export function alertBadge(level: string): string {
  switch (level) {
    case "critical":
      return `🔴 ${chalk.red.bold("CRITICAL")}`;
    case "warning":
      return `🟡 ${chalk.yellow.bold("WARNING")}`;
    default:
      return chalk.dim(level.toUpperCase());
  }
}

/** HH:MM:SS in local time for log rows. */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toTimeString().slice(0, 8);
}

/** "12s ago", "8m ago", "3h ago" — for freshness lines. */
export function fmtAge(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** The shared freshness line every daemon-backed command opens with. */
export function freshnessLine(
  kind: "ok" | "stale" | "missing",
  generatedAt?: Date,
  now: Date = new Date()
): string {
  if (kind === "missing") {
    return chalk.dim("○ no data yet — run the Veyr menu bar app once");
  }
  if (kind === "stale") {
    return (
      chalk.yellow("● stale") +
      chalk.dim(` · updated ${fmtAge(generatedAt!, now)} — is the Veyr menu bar app running?`)
    );
  }
  return chalk.green("● live") + chalk.dim(` · updated ${fmtAge(generatedAt!, now)}`);
}
