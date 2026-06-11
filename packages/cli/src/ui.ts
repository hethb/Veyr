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

/** HH:MM:SS in local time for log rows. */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toTimeString().slice(0, 8);
}
