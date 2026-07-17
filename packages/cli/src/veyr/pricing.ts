// Offline Claude pricing, used only when the daemon is unreachable and
// sessions must be priced CLI-side from ~/.veyr/cache/sessions.json.
//
// Mirrors the built-in tables in
// packages/desktop-mac/Sources/CodexBarCore/Vendored/CostUsage/CostUsagePricing.swift
// (the `claude` dictionary, long-context thresholds, and the historical
// repricing cutoff) and the static fallback in
// packages/desktop-mac/Sources/VeyrKit/Costs/PricingTable.swift. Keep the
// copies in sync by hand — there is no shared module across the
// Swift/TypeScript boundary (same convention as guidanceRules.ts's
// DEFAULT_RULE_SET).
//
// One known, accepted divergence: the app prefers a models.dev catalog
// cached on its side of the fence, which this CLI can't read. For the models
// listed below the built-in rates match; for models only the catalog knows,
// CLI-side figures fall back to coarser rates. Daemon-served figures are
// always the app's own numbers and never touch this module.

interface ClaudePricing {
  readonly inputCostPerToken: number;
  readonly outputCostPerToken: number;
  readonly cacheCreationInputCostPerToken: number;
  readonly cacheReadInputCostPerToken: number;
  readonly thresholdTokens?: number;
  readonly inputCostPerTokenAboveThreshold?: number;
  readonly outputCostPerTokenAboveThreshold?: number;
  readonly cacheCreationInputCostPerTokenAboveThreshold?: number;
  readonly cacheReadInputCostPerTokenAboveThreshold?: number;
}

const CLAUDE: Record<string, ClaudePricing> = {
  "claude-fable-5": {
    inputCostPerToken: 1e-5,
    outputCostPerToken: 5e-5,
    cacheCreationInputCostPerToken: 1.25e-5,
    cacheReadInputCostPerToken: 1e-6,
  },
  "claude-haiku-4-5-20251001": {
    inputCostPerToken: 1e-6,
    outputCostPerToken: 5e-6,
    cacheCreationInputCostPerToken: 1.25e-6,
    cacheReadInputCostPerToken: 1e-7,
  },
  "claude-haiku-4-5": {
    inputCostPerToken: 1e-6,
    outputCostPerToken: 5e-6,
    cacheCreationInputCostPerToken: 1.25e-6,
    cacheReadInputCostPerToken: 1e-7,
  },
  "claude-opus-4-5-20251101": {
    inputCostPerToken: 5e-6,
    outputCostPerToken: 2.5e-5,
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheReadInputCostPerToken: 5e-7,
  },
  "claude-opus-4-5": {
    inputCostPerToken: 5e-6,
    outputCostPerToken: 2.5e-5,
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheReadInputCostPerToken: 5e-7,
  },
  "claude-opus-4-6-20260205": {
    inputCostPerToken: 5e-6,
    outputCostPerToken: 2.5e-5,
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheReadInputCostPerToken: 5e-7,
  },
  "claude-opus-4-6": {
    inputCostPerToken: 5e-6,
    outputCostPerToken: 2.5e-5,
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheReadInputCostPerToken: 5e-7,
  },
  "claude-opus-4-7": {
    inputCostPerToken: 5e-6,
    outputCostPerToken: 2.5e-5,
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheReadInputCostPerToken: 5e-7,
  },
  "claude-opus-4-8": {
    inputCostPerToken: 5e-6,
    outputCostPerToken: 2.5e-5,
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheReadInputCostPerToken: 5e-7,
  },
  "claude-sonnet-4-5": {
    inputCostPerToken: 3e-6,
    outputCostPerToken: 1.5e-5,
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheReadInputCostPerToken: 3e-7,
    thresholdTokens: 200_000,
    inputCostPerTokenAboveThreshold: 6e-6,
    outputCostPerTokenAboveThreshold: 2.25e-5,
    cacheCreationInputCostPerTokenAboveThreshold: 7.5e-6,
    cacheReadInputCostPerTokenAboveThreshold: 6e-7,
  },
  "claude-sonnet-4-6": {
    inputCostPerToken: 3e-6,
    outputCostPerToken: 1.5e-5,
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheReadInputCostPerToken: 3e-7,
  },
  "claude-sonnet-4-5-20250929": {
    inputCostPerToken: 3e-6,
    outputCostPerToken: 1.5e-5,
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheReadInputCostPerToken: 3e-7,
    thresholdTokens: 200_000,
    inputCostPerTokenAboveThreshold: 6e-6,
    outputCostPerTokenAboveThreshold: 2.25e-5,
    cacheCreationInputCostPerTokenAboveThreshold: 7.5e-6,
    cacheReadInputCostPerTokenAboveThreshold: 6e-7,
  },
  "claude-opus-4-20250514": {
    inputCostPerToken: 1.5e-5,
    outputCostPerToken: 7.5e-5,
    cacheCreationInputCostPerToken: 1.875e-5,
    cacheReadInputCostPerToken: 1.5e-6,
  },
  "claude-opus-4-1": {
    inputCostPerToken: 1.5e-5,
    outputCostPerToken: 7.5e-5,
    cacheCreationInputCostPerToken: 1.875e-5,
    cacheReadInputCostPerToken: 1.5e-6,
  },
  "claude-sonnet-4-20250514": {
    inputCostPerToken: 3e-6,
    outputCostPerToken: 1.5e-5,
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheReadInputCostPerToken: 3e-7,
    thresholdTokens: 200_000,
    inputCostPerTokenAboveThreshold: 6e-6,
    outputCostPerTokenAboveThreshold: 2.25e-5,
    cacheCreationInputCostPerTokenAboveThreshold: 7.5e-6,
    cacheReadInputCostPerTokenAboveThreshold: 6e-7,
  },
};

/** Before this instant, opus-4-6 / sonnet-4-6 usage is repriced with the
 * long-context tiers they had at the time (CostUsagePricing's
 * claudeFullContextStandardPricingCutoff). */
const FULL_CONTEXT_STANDARD_PRICING_CUTOFF_MS = 1_773_360_000 * 1000;

const CLAUDE_HISTORICAL_LONG_CONTEXT: Record<string, ClaudePricing> = {
  "claude-opus-4-6": {
    inputCostPerToken: 5e-6,
    outputCostPerToken: 2.5e-5,
    cacheCreationInputCostPerToken: 6.25e-6,
    cacheReadInputCostPerToken: 5e-7,
    thresholdTokens: 200_000,
    inputCostPerTokenAboveThreshold: 1e-5,
    outputCostPerTokenAboveThreshold: 3.75e-5,
    cacheCreationInputCostPerTokenAboveThreshold: 1.25e-5,
    cacheReadInputCostPerTokenAboveThreshold: 1e-6,
  },
  "claude-sonnet-4-6": {
    inputCostPerToken: 3e-6,
    outputCostPerToken: 1.5e-5,
    cacheCreationInputCostPerToken: 3.75e-6,
    cacheReadInputCostPerToken: 3e-7,
    thresholdTokens: 200_000,
    inputCostPerTokenAboveThreshold: 6e-6,
    outputCostPerTokenAboveThreshold: 2.25e-5,
    cacheCreationInputCostPerTokenAboveThreshold: 7.5e-6,
    cacheReadInputCostPerTokenAboveThreshold: 6e-7,
  },
};

/** VeyrKit's PricingTable.swift static fallback (per-million rates). */
const STATIC_FALLBACK: ReadonlyArray<{ prefix: string; inPerM: number; outPerM: number }> = [
  { prefix: "claude-opus-4", inPerM: 15.0, outPerM: 75.0 },
  { prefix: "claude-sonnet-4", inPerM: 3.0, outPerM: 15.0 },
  { prefix: "claude-haiku-4", inPerM: 0.8, outPerM: 4.0 },
  { prefix: "claude-3-5-sonnet", inPerM: 3.0, outPerM: 15.0 },
  { prefix: "claude-3-5-haiku", inPerM: 0.8, outPerM: 4.0 },
  { prefix: "claude-3-opus", inPerM: 15.0, outPerM: 75.0 },
];
const UNKNOWN_MODEL_IN_PER_M = 2.0;
const UNKNOWN_MODEL_OUT_PER_M = 8.0;
const CACHE_READ_RATE_MULTIPLIER = 0.1;
const CACHE_WRITE_RATE_MULTIPLIER = 1.25;

/** Rows in sessions.json are already normalized by the scanner; this only
 * needs the trailing dated-suffix reduction for table lookup. */
function lookupClaude(modelId: string): ClaudePricing | undefined {
  const direct = CLAUDE[modelId];
  if (direct) return direct;
  const dated = modelId.match(/^(.*)-\d{8}$/);
  if (dated?.[1]) return CLAUDE[dated[1]];
  return undefined;
}

function baseKeyFor(modelId: string): string {
  const dated = modelId.match(/^(.*)-\d{8}$/);
  return dated?.[1] && CLAUDE[dated[1]] ? dated[1] : modelId;
}

function claudeCost(
  pricing: ClaudePricing,
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number
): number {
  const longContext =
    pricing.thresholdTokens !== undefined && input + cacheRead + cacheWrite > pricing.thresholdTokens;
  const inputRate = longContext
    ? (pricing.inputCostPerTokenAboveThreshold ?? pricing.inputCostPerToken)
    : pricing.inputCostPerToken;
  const cacheReadRate = longContext
    ? (pricing.cacheReadInputCostPerTokenAboveThreshold ?? pricing.cacheReadInputCostPerToken)
    : pricing.cacheReadInputCostPerToken;
  const cacheWriteRate = longContext
    ? (pricing.cacheCreationInputCostPerTokenAboveThreshold ?? pricing.cacheCreationInputCostPerToken)
    : pricing.cacheCreationInputCostPerToken;
  const outputRate = longContext
    ? (pricing.outputCostPerTokenAboveThreshold ?? pricing.outputCostPerToken)
    : pricing.outputCostPerToken;
  return input * inputRate + cacheRead * cacheReadRate + cacheWrite * cacheWriteRate + output * outputRate;
}

/**
 * USD cost of one usage record, following the app's resolution order minus
 * the models.dev catalog: historical repricing (when dated before the
 * cutoff), the built-in Claude table, then the static prefix table, then the
 * unknown-model fallback rates.
 */
export function costUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheWriteTokens: number,
  timestampMs: number
): number {
  const input = Math.max(0, inputTokens);
  const output = Math.max(0, outputTokens);
  const cacheRead = Math.max(0, cacheReadTokens);
  const cacheWrite = Math.max(0, cacheWriteTokens);

  const key = baseKeyFor(modelId);
  const historical = CLAUDE_HISTORICAL_LONG_CONTEXT[key];
  if (historical && CLAUDE[key]) {
    const pricing = timestampMs < FULL_CONTEXT_STANDARD_PRICING_CUTOFF_MS ? historical : CLAUDE[key];
    return claudeCost(pricing, input, output, cacheRead, cacheWrite);
  }

  const builtIn = lookupClaude(modelId);
  if (builtIn) return claudeCost(builtIn, input, output, cacheRead, cacheWrite);

  const fallback = STATIC_FALLBACK.find((entry) => modelId.startsWith(entry.prefix));
  const inPerM = fallback?.inPerM ?? UNKNOWN_MODEL_IN_PER_M;
  const outPerM = fallback?.outPerM ?? UNKNOWN_MODEL_OUT_PER_M;
  const perToken = 1 / 1_000_000;
  return (
    input * perToken * inPerM +
    output * perToken * outPerM +
    cacheRead * perToken * inPerM * CACHE_READ_RATE_MULTIPLIER +
    cacheWrite * perToken * inPerM * CACHE_WRITE_RATE_MULTIPLIER
  );
}
