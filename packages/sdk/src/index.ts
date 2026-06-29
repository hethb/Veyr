/**
 * Veyr SDK — drop-in LLM cost tracking for production apps.
 *
 *   import OpenAI from "openai";
 *   import { veyrOpenAI } from "canopy-sdk";
 *
 *   const openai = new OpenAI(
 *     veyrOpenAI({ apiKey: process.env.OPENAI_API_KEY! })
 *   );
 *
 * Set VEYR_KEY once (from the Veyr dashboard). Every call is logged.
 */

export interface VeyrConfig {
  apiKey: string;
  /**
   * Override for self-hosted proxies. Defaults to VEYR_BASE_URL or the
   * public Veyr API.
   */
  baseUrl?: string;
  /**
   * Default feature tag for all requests from this client (maps to dashboard
   * "Cost by feature"). Override per-request via OpenAI `headers`.
   */
  feature?: string;
  /** Layer 2: compress system/user prompts before upstream (proxy). */
  compress?: boolean;
  /**
   * Layer 2: enable provider prompt caching. On Anthropic, Veyr wraps
   * long system prompts with `cache_control: { type: "ephemeral" }` so
   * subsequent calls reuse the cached prefix (~90% cheaper input). On OpenAI
   * the cache is automatic above ~1024 tokens of stable prefix — this flag
   * just opts you in to cache telemetry headers.
   */
  enablePromptCaching?: boolean;
  /** Layer 3: cap max_tokens on outbound requests. */
  maxCompletionTokens?: number;
}

// The hosted Veyr proxy. Override with `baseUrl` or VEYR_BASE_URL
// (e.g. http://localhost:3001 for the desktop app / local dev).
const DEFAULT_BASE_URL = "https://promptlens.fly.dev";

export class VeyrConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VeyrConfigError";
  }
}

function resolveBase(config: VeyrConfig): string {
  const base =
    config.baseUrl ??
    (typeof process !== "undefined" ? process.env.VEYR_BASE_URL : undefined) ??
    DEFAULT_BASE_URL;
  return base.replace(/\/$/, "");
}

/**
 * Reads VEYR_KEY (and optional VEYR_BASE_URL /
 * VEYR_FEATURE_TAG) from the environment, or uses values passed in
 * `overrides`.
 */
export function resolveVeyrConfig(
  overrides?: Partial<VeyrConfig>
): VeyrConfig {
  const apiKey =
    overrides?.apiKey ??
    (typeof process !== "undefined" ? process.env.VEYR_KEY : undefined);

  if (!apiKey?.trim()) {
    throw new VeyrConfigError(
      "Missing VEYR_KEY. Sign in to the Veyr dashboard → API Keys → create a key, then set VEYR_KEY=pl_live_… in your environment."
    );
  }

  return {
    apiKey: apiKey.trim(),
    baseUrl: overrides?.baseUrl,
    feature:
      overrides?.feature ??
      (typeof process !== "undefined" ? process.env.VEYR_FEATURE_TAG : undefined),
    compress: overrides?.compress,
    enablePromptCaching: overrides?.enablePromptCaching,
    maxCompletionTokens: overrides?.maxCompletionTokens,
  };
}

/**
 * Returns config you can spread into the OpenAI client constructor.
 */
function controlPlaneHeaders(config: VeyrConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "x-veyr-key": config.apiKey,
  };
  if (config.feature) headers["x-feature-tag"] = config.feature;
  if (config.compress) headers["x-veyr-compress"] = "1";
  if (config.enablePromptCaching) headers["x-veyr-cache"] = "1";
  if (config.maxCompletionTokens != null && config.maxCompletionTokens > 0) {
    headers["x-veyr-max-tokens"] = String(config.maxCompletionTokens);
  }
  return headers;
}

export function createOpenAIConfig(config: VeyrConfig): {
  baseURL: string;
  defaultHeaders: Record<string, string>;
} {
  return {
    baseURL: `${resolveBase(config)}/openai/v1`,
    defaultHeaders: controlPlaneHeaders(config),
  };
}

/**
 * Returns config for the Anthropic SDK constructor.
 */
export function createAnthropicConfig(config: VeyrConfig): {
  baseURL: string;
  defaultHeaders: Record<string, string>;
} {
  return {
    baseURL: `${resolveBase(config)}/anthropic/v1`,
    defaultHeaders: controlPlaneHeaders(config),
  };
}

export interface ProviderOpenAIOptions {
  /** Your OpenAI (or Groq-compatible) API key — unchanged. */
  apiKey: string;
  /** Veyr key; defaults to VEYR_KEY env var. */
  veyrKey?: string;
  baseUrl?: string;
  /** Tag spend in the dashboard (e.g. "billing-bot"). */
  feature?: string;
  compress?: boolean;
  enablePromptCaching?: boolean;
  maxCompletionTokens?: number;
}

/**
 * One-call OpenAI constructor options: provider key + Veyr routing.
 *
 *   const openai = new OpenAI(veyrOpenAI({ apiKey: process.env.OPENAI_API_KEY! }));
 */
export function veyrOpenAI(options: ProviderOpenAIOptions): {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
} {
  const pl = resolveVeyrConfig({
    apiKey: options.veyrKey,
    baseUrl: options.baseUrl,
    feature: options.feature,
    compress: options.compress,
    enablePromptCaching: options.enablePromptCaching,
    maxCompletionTokens: options.maxCompletionTokens,
  });

  return {
    apiKey: options.apiKey,
    ...createOpenAIConfig(pl),
  };
}

export interface ProviderAnthropicOptions {
  apiKey: string;
  veyrKey?: string;
  baseUrl?: string;
  feature?: string;
  compress?: boolean;
  enablePromptCaching?: boolean;
  maxCompletionTokens?: number;
}

/**
 * One-call Anthropic constructor options: provider key + Veyr routing.
 */
export function veyrAnthropic(options: ProviderAnthropicOptions): {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
} {
  const pl = resolveVeyrConfig({
    apiKey: options.veyrKey,
    baseUrl: options.baseUrl,
    feature: options.feature,
    compress: options.compress,
    enablePromptCaching: options.enablePromptCaching,
    maxCompletionTokens: options.maxCompletionTokens,
  });

  return {
    apiKey: options.apiKey,
    ...createAnthropicConfig(pl),
  };
}
