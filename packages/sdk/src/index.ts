/**
 * Canopy SDK — drop-in LLM cost tracking for production apps.
 *
 *   import OpenAI from "openai";
 *   import { promptlensOpenAI } from "canopy-sdk";
 *
 *   const openai = new OpenAI(
 *     promptlensOpenAI({ apiKey: process.env.OPENAI_API_KEY! })
 *   );
 *
 * Set PROMPTLENS_KEY once (from the Canopy dashboard). Every call is logged.
 */

export interface PromptLensConfig {
  apiKey: string;
  /**
   * Override for self-hosted proxies. Defaults to PROMPTLENS_BASE_URL or the
   * public Canopy API.
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
   * Layer 2: enable provider prompt caching. On Anthropic, Canopy wraps
   * long system prompts with `cache_control: { type: "ephemeral" }` so
   * subsequent calls reuse the cached prefix (~90% cheaper input). On OpenAI
   * the cache is automatic above ~1024 tokens of stable prefix — this flag
   * just opts you in to cache telemetry headers.
   */
  enablePromptCaching?: boolean;
  /** Layer 3: cap max_tokens on outbound requests. */
  maxCompletionTokens?: number;
}

const DEFAULT_BASE_URL = "https://api.promptlens.dev";

export class PromptLensConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptLensConfigError";
  }
}

function resolveBase(config: PromptLensConfig): string {
  const base =
    config.baseUrl ??
    (typeof process !== "undefined" ? process.env.PROMPTLENS_BASE_URL : undefined) ??
    DEFAULT_BASE_URL;
  return base.replace(/\/$/, "");
}

/**
 * Reads PROMPTLENS_KEY (and optional PROMPTLENS_BASE_URL /
 * PROMPTLENS_FEATURE_TAG) from the environment, or uses values passed in
 * `overrides`.
 */
export function resolvePromptLensConfig(
  overrides?: Partial<PromptLensConfig>
): PromptLensConfig {
  const apiKey =
    overrides?.apiKey ??
    (typeof process !== "undefined" ? process.env.PROMPTLENS_KEY : undefined);

  if (!apiKey?.trim()) {
    throw new PromptLensConfigError(
      "Missing PROMPTLENS_KEY. Sign in to the Canopy dashboard → API Keys → create a key, then set PROMPTLENS_KEY=pl_live_… in your environment."
    );
  }

  return {
    apiKey: apiKey.trim(),
    baseUrl: overrides?.baseUrl,
    feature:
      overrides?.feature ??
      (typeof process !== "undefined" ? process.env.PROMPTLENS_FEATURE_TAG : undefined),
    compress: overrides?.compress,
    enablePromptCaching: overrides?.enablePromptCaching,
    maxCompletionTokens: overrides?.maxCompletionTokens,
  };
}

/**
 * Returns config you can spread into the OpenAI client constructor.
 */
function controlPlaneHeaders(config: PromptLensConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "x-promptlens-key": config.apiKey,
  };
  if (config.feature) headers["x-feature-tag"] = config.feature;
  if (config.compress) headers["x-promptlens-compress"] = "1";
  if (config.enablePromptCaching) headers["x-promptlens-cache"] = "1";
  if (config.maxCompletionTokens != null && config.maxCompletionTokens > 0) {
    headers["x-promptlens-max-tokens"] = String(config.maxCompletionTokens);
  }
  return headers;
}

export function createOpenAIConfig(config: PromptLensConfig): {
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
export function createAnthropicConfig(config: PromptLensConfig): {
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
  /** Canopy key; defaults to PROMPTLENS_KEY env var. */
  promptlensKey?: string;
  baseUrl?: string;
  /** Tag spend in the dashboard (e.g. "billing-bot"). */
  feature?: string;
  compress?: boolean;
  enablePromptCaching?: boolean;
  maxCompletionTokens?: number;
}

/**
 * One-call OpenAI constructor options: provider key + Canopy routing.
 *
 *   const openai = new OpenAI(promptlensOpenAI({ apiKey: process.env.OPENAI_API_KEY! }));
 */
export function promptlensOpenAI(options: ProviderOpenAIOptions): {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
} {
  const pl = resolvePromptLensConfig({
    apiKey: options.promptlensKey,
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
  promptlensKey?: string;
  baseUrl?: string;
  feature?: string;
  compress?: boolean;
  enablePromptCaching?: boolean;
  maxCompletionTokens?: number;
}

/**
 * One-call Anthropic constructor options: provider key + Canopy routing.
 */
export function promptlensAnthropic(options: ProviderAnthropicOptions): {
  apiKey: string;
  baseURL: string;
  defaultHeaders: Record<string, string>;
} {
  const pl = resolvePromptLensConfig({
    apiKey: options.promptlensKey,
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
