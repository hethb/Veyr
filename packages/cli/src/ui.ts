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

/** Compact token count matching the Mac app's VeyrFormat.tokens:
 * 950 → "950", 12_400 → "12.4k", 1_200_000 → "1.2M". */
export function fmtTokens(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/** Relative session timestamp matching VeyrFormat.sessionTimestamp:
 * "Today 14:23", "Yesterday 09:10", "Mon 18:02", else "Jun 12". */
export function fmtSessionStamp(ms: number, now: Date = new Date()): string {
  const date = new Date(ms);
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const sameDay = (a: Date, b: Date): boolean =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, now)) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(date, yesterday)) return `Yesterday ${time}`;
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);
  if (date.getTime() >= weekAgo.getTime()) {
    return `${date.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Bold section heading with consistent spacing above. */
export function sectionTitle(title: string): string {
  return `\n${chalk.bold(title)}`;
}

/** Horizontal bar for spend charts: filled blocks scaled to max, dim when zero. */
export function bar(value: number, max: number, width = 24): string {
  if (max <= 0 || value <= 0) return chalk.dim("·");
  const filled = Math.max(1, Math.round((value / max) * width));
  return chalk.cyan("█".repeat(filled));
}

/** Left-aligns each column to its widest cell; right-aligns columns flagged in
 * `rightAlign`. Cells may contain ANSI codes — width is measured without them. */
export function renderColumns(
  rows: readonly (readonly string[])[],
  options: { indent?: string; gap?: string; rightAlign?: readonly number[] } = {}
): string[] {
  const indent = options.indent ?? "  ";
  const gap = options.gap ?? "  ";
  const rightAlign = new Set(options.rightAlign ?? []);
  // eslint-disable-next-line no-control-regex
  const visible = (s: string): number => s.replace(/\u001b\[[0-9;]*m/g, "").length;
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, visible(cell));
    });
  }
  return rows.map((row) => {
    const padded = row.map((cell, i) => {
      const pad = " ".repeat(Math.max(0, (widths[i] ?? 0) - visible(cell)));
      // Never pad the last column — avoids trailing whitespace.
      if (i === row.length - 1 && !rightAlign.has(i)) return cell;
      return rightAlign.has(i) ? pad + cell : cell + pad;
    });
    return indent + padded.join(gap).trimEnd();
  });
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
  kind: "ok" | "stale" | "local" | "missing",
  generatedAt?: Date,
  now: Date = new Date()
): string {
  if (kind === "missing") {
    return chalk.dim("○ no data yet — no local agent session logs found on this machine");
  }
  if (kind === "local") {
    return chalk.cyan("● local") + chalk.dim(" · computed just now from local session logs");
  }
  if (kind === "stale") {
    return (
      chalk.yellow("● stale") +
      chalk.dim(` · updated ${fmtAge(generatedAt!, now)} — is the Veyr desktop app still running?`)
    );
  }
  return chalk.green("● live") + chalk.dim(` · updated ${fmtAge(generatedAt!, now)}`);
}
