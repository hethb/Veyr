// Reader for ~/.veyr/savings.json — the savings tracker's lifetime and
// per-project totals (VeyrSavingsStore.swift, JSONEncoder default camelCase
// keys). Read-only: the CLI never writes this file; only the Mac app folds
// new observations into it. Used as the fallback when the daemon's /savings
// endpoint (which also computes the live redundant-read figure) is
// unreachable, and for the `--projects` breakdown, which the daemon doesn't
// expose.

import * as fs from "node:fs";
import { savingsStoreFilePath } from "./paths.js";

export interface SavingsTotals {
  readonly component1MeasuredTokens: number;
  readonly component1MeasuredUSD: number;
  readonly component1AssumptionTokens: number;
  readonly component1AssumptionUSD: number;
  readonly component3CorrelationalTokens: number;
  readonly component3CorrelationalUSD: number;
}

export const EMPTY_TOTALS: SavingsTotals = {
  component1MeasuredTokens: 0,
  component1MeasuredUSD: 0,
  component1AssumptionTokens: 0,
  component1AssumptionUSD: 0,
  component3CorrelationalTokens: 0,
  component3CorrelationalUSD: 0,
};

export interface SavingsStoreFile {
  readonly lifetimeTotals: SavingsTotals;
  readonly perProjectTotals: Record<string, SavingsTotals>;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function totalsFrom(value: unknown): SavingsTotals {
  if (typeof value !== "object" || value === null) return EMPTY_TOTALS;
  const record = value as Record<string, unknown>;
  return {
    component1MeasuredTokens: num(record["component1MeasuredTokens"]),
    component1MeasuredUSD: num(record["component1MeasuredUSD"]),
    component1AssumptionTokens: num(record["component1AssumptionTokens"]),
    component1AssumptionUSD: num(record["component1AssumptionUSD"]),
    component3CorrelationalTokens: num(record["component3CorrelationalTokens"]),
    component3CorrelationalUSD: num(record["component3CorrelationalUSD"]),
  };
}

/** null means the file doesn't exist or can't be parsed — i.e. the tracker
 * has never folded anything on this machine. */
export function readSavingsStore(): SavingsStoreFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(savingsStoreFilePath(), "utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const perProjectRaw = record["perProjectTotals"];
  const perProjectTotals: Record<string, SavingsTotals> = {};
  if (typeof perProjectRaw === "object" && perProjectRaw !== null) {
    for (const [tag, totals] of Object.entries(perProjectRaw as Record<string, unknown>)) {
      perProjectTotals[tag] = totalsFrom(totals);
    }
  }
  return { lifetimeTotals: totalsFrom(record["lifetimeTotals"]), perProjectTotals };
}

export function totalUsd(totals: SavingsTotals): number {
  return totals.component1MeasuredUSD + totals.component1AssumptionUSD + totals.component3CorrelationalUSD;
}

export function totalTokens(totals: SavingsTotals): number {
  return (
    totals.component1MeasuredTokens + totals.component1AssumptionTokens + totals.component3CorrelationalTokens
  );
}
