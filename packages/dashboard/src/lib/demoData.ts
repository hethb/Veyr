/**
 * Realistic-looking mock data for the public landing-page demo.
 *
 * No auth, no network — these helpers feed the real chart/table components
 * used on the authenticated dashboard so visitors get an honest preview.
 */

import type {
  ByTagRow,
  Overview,
  Period,
  TimeseriesPoint,
  TopTemplateRow,
} from "./api";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Tiny deterministic PRNG so demo numbers are stable across renders. */
function seedRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function round(n: number, places = 4): number {
  const m = Math.pow(10, places);
  return Math.round(n * m) / m;
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

export function buildDemoTimeseries(period: Period): TimeseriesPoint[] {
  const days = period === "30d" ? 30 : period === "1d" ? 1 : 7;
  const rng = seedRandom(period === "30d" ? 1234 : 5678);
  const points: TimeseriesPoint[] = [];
  const now = Date.now();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    const dow = d.getUTCDay();
    // weekends are quieter
    const baseline = dow === 0 || dow === 6 ? 2.4 : 5.4;
    // gentle upward trend across the period
    const trend = 1 + ((days - 1 - i) / days) * 0.35;
    const cost = round(baseline * trend + rng() * 1.6 - 0.4);
    const requests = Math.max(0, Math.round(cost * 260 + rng() * 220));
    points.push({ date: dateStr(d), cost, requests });
  }
  return points;
}

// ---------------------------------------------------------------------------
// By-tag
// ---------------------------------------------------------------------------

const BY_TAG_BASE: ByTagRow[] = [
  { feature_tag: "api_chat",        cost: 18.42, requests: 5120 },
  { feature_tag: "api_summarize",   cost:  9.87, requests: 1840 },
  { feature_tag: "api_extract",     cost:  6.21, requests:  980 },
  { feature_tag: "background_jobs", cost:  4.55, requests:  720 },
  { feature_tag: "api_classify",    cost:  2.91, requests: 1050 },
  { feature_tag: "onboarding",      cost:  1.34, requests:  420 },
  { feature_tag: "search",          cost:  0.92, requests:  310 },
  { feature_tag: "untagged",        cost:  0.41, requests:  150 },
];

export function buildDemoByTag(period: Period): ByTagRow[] {
  const factor = period === "30d" ? 4.2 : period === "1d" ? 0.18 : 1;
  return BY_TAG_BASE.map((r) => ({
    feature_tag: r.feature_tag,
    cost: round(r.cost * factor),
    requests: Math.round(r.requests * factor),
  }));
}

// ---------------------------------------------------------------------------
// Top templates
// ---------------------------------------------------------------------------

export const demoTopTemplates: TopTemplateRow[] = [
  {
    prompt_hash: "a3f1b2c4d5e6f7a8b9c0d1e2f3a4b5c6",
    total_cost: 12.43,
    request_count: 3201,
    avg_tokens: 1840,
    feature_tag: "api_chat",
  },
  {
    prompt_hash: "b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2",
    total_cost: 7.18,
    request_count: 1640,
    avg_tokens: 2210,
    feature_tag: "api_summarize",
  },
  {
    prompt_hash: "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0",
    total_cost: 4.92,
    request_count: 870,
    avg_tokens: 2680,
    feature_tag: "api_extract",
  },
  {
    prompt_hash: "d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7",
    total_cost: 3.81,
    request_count: 612,
    avg_tokens: 2940,
    feature_tag: "background_jobs",
  },
  {
    prompt_hash: "e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4",
    total_cost: 2.45,
    request_count: 950,
    avg_tokens: 1320,
    feature_tag: "api_classify",
  },
  {
    prompt_hash: "f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1",
    total_cost: 1.07,
    request_count: 380,
    avg_tokens: 980,
    feature_tag: "onboarding",
  },
  {
    prompt_hash: "1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d",
    total_cost: 0.82,
    request_count: 270,
    avg_tokens: 1080,
    feature_tag: "search",
  },
  {
    prompt_hash: "8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
    total_cost: 0.34,
    request_count: 120,
    avg_tokens: 720,
    feature_tag: "untagged",
  },
];

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export const demoOverview: Overview = {
  today: { cost: 5.9612,   requests:  1_672, tokens:  3_240_000 },
  week:  { cost: 38.6304,  requests: 10_909, tokens: 21_412_000 },
  month: { cost: 142.1830, requests: 41_030, tokens: 84_281_000 },
};
