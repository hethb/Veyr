/**
 * Cost calculation utility.
 *
 * Prices are USD per 1k tokens.
 * Source: vendor pricing pages as of 2025; update this table when prices change.
 *
 * Unrecognized models fall back to a conservative 0.002 input / 0.008 output.
 */

interface ModelPrice {
  /** USD per 1,000 input tokens */
  input: number;
  /** USD per 1,000 output tokens */
  output: number;
}

const PRICES: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4o":          { input: 0.00250,  output: 0.01000 },
  "gpt-4o-mini":     { input: 0.00015,  output: 0.00060 },
  "gpt-4-turbo":     { input: 0.01000,  output: 0.03000 },
  "gpt-3.5-turbo":   { input: 0.00050,  output: 0.00150 },

  // Groq (USD per 1k tokens — update when vendor pricing changes)
  "llama-3.1-8b-instant":    { input: 0.00005, output: 0.00008 },
  "llama-3.3-70b-versatile": { input: 0.00059, output: 0.00079 },
  "llama3-8b-8192":          { input: 0.00005, output: 0.00008 },
  "mixtral-8x7b-32768":      { input: 0.00024, output: 0.00024 },

  // Anthropic
  "claude-3-5-sonnet-20241022": { input: 0.00300, output: 0.01500 },
  "claude-3-5-haiku-20241022":  { input: 0.00080, output: 0.00400 },
  "claude-3-opus-20240229":     { input: 0.01500, output: 0.07500 },
};

const FALLBACK: ModelPrice = { input: 0.002, output: 0.008 };

/**
 * Resolves a model id (which may include a date or version suffix) to its
 * pricing entry. We try exact match first, then a prefix match for forward
 * compatibility (e.g. provider returns `gpt-4o-2024-11-20`).
 */
function resolvePrice(model: string): ModelPrice {
  const direct = PRICES[model];
  if (direct) return direct;

  const lower = model.toLowerCase();
  for (const [key, price] of Object.entries(PRICES)) {
    if (lower.startsWith(key.toLowerCase())) return price;
  }
  return FALLBACK;
}

/** USD per single input (prompt) token for a model. */
export function inputCostPerToken(model: string): number {
  return resolvePrice(model).input / 1000;
}

/** USD per single output (completion) token for a model. */
export function outputCostPerToken(model: string): number {
  return resolvePrice(model).output / 1000;
}

/**
 * Provider multipliers on the base input price for prompt-cache token classes.
 * Anthropic: cache writes cost 1.25x input, cache reads cost 0.10x input.
 * OpenAI: cached input costs roughly 0.50x input (no separate write fee).
 * We treat OpenAI's cache as the "ephemeral" Anthropic profile for any
 * provider we don't recognise, biasing toward the customer's wallet.
 */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER_ANTHROPIC = 0.10;
const CACHE_READ_MULTIPLIER_OPENAI = 0.50;

function cacheReadMultiplier(model: string): number {
  return model.toLowerCase().includes("claude")
    ? CACHE_READ_MULTIPLIER_ANTHROPIC
    : CACHE_READ_MULTIPLIER_OPENAI;
}

/**
 * Calculates total cost in USD for a single request, accounting for prompt
 * cache reads (cheaper) and cache creations (slightly more expensive than
 * regular input).
 *
 * `promptTokens` is the TOTAL input bill (regular + cache read + cache write);
 * we subtract the two cache buckets to derive regular input.
 *
 * Result is rounded to 8 decimal places to fit numeric(10, 8).
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens = 0,
  cacheCreationTokens = 0
): number {
  const price = resolvePrice(model);
  const safeCached = Math.max(0, cachedTokens);
  const safeCreation = Math.max(0, cacheCreationTokens);
  const regularInput = Math.max(0, promptTokens - safeCached - safeCreation);

  const baseInputCost = (regularInput / 1000) * price.input;
  const cachedReadCost =
    (safeCached / 1000) * price.input * cacheReadMultiplier(model);
  const cacheWriteCost =
    (safeCreation / 1000) * price.input * CACHE_WRITE_MULTIPLIER;
  const outputCost = (completionTokens / 1000) * price.output;

  const total = baseInputCost + cachedReadCost + cacheWriteCost + outputCost;
  return Math.round(total * 1e8) / 1e8;
}
