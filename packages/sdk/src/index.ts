/**
 * PromptLens SDK — drop-in LLM cost tracking for production apps.
 *
 *   import OpenAI from "openai";
 *   import { promptlensOpenAI } from "promptlens";
 *
 *   const openai = new OpenAI(
 *     promptlensOpenAI({ apiKey: process.env.OPENAI_API_KEY! })
 *   );
 *
 * Set PROMPTLENS_KEY once (from the PromptLens dashboard). Every call is logged.
 */

export interface PromptLensConfig {
  apiKey: string;
  /**
   * Override for self-hosted proxies. Defaults to PROMPTLENS_BASE_URL or the
   * public PromptLens API.
   */
  baseUrl?: string;
  /**
   * Default feature tag for all requests from this client (maps to dashboard
   * "Cost by feature"). Override per-request via OpenAI `headers`.
   */
  feature?: string;
  /** Layer 2: compress system/user prompts before upstream (proxy). */
  compress?: boolean;
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
 * Reads PROMPTLENS_KEY (and optional PROMPTLENS_BASE_URL) from the environment,
 * or uses values passed in `overrides`.
 */
export function resolvePromptLensConfig(
  overrides?: Partial<PromptLensConfig>
): PromptLensConfig {
  const apiKey =
    overrides?.apiKey ??
    (typeof process !== "undefined" ? process.env.PROMPTLENS_KEY : undefined);

  if (!apiKey?.trim()) {
    throw new PromptLensConfigError(
      "Missing PROMPTLENS_KEY. Sign in to the PromptLens dashboard → API Keys → create a key, then set PROMPTLENS_KEY=pl_live_… in your environment."
    );
  }

  return {
    apiKey: apiKey.trim(),
    baseUrl: overrides?.baseUrl,
    feature: overrides?.feature,
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
  /** PromptLens key; defaults to PROMPTLENS_KEY env var. */
  promptlensKey?: string;
  baseUrl?: string;
  /** Tag spend in the dashboard (e.g. "billing-bot"). */
  feature?: string;
  compress?: boolean;
  maxCompletionTokens?: number;
}

/**
 * One-call OpenAI constructor options: provider key + PromptLens routing.
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
  maxCompletionTokens?: number;
}

/**
 * One-call Anthropic constructor options: provider key + PromptLens routing.
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
    maxCompletionTokens: options.maxCompletionTokens,
  });

  return {
    apiKey: options.apiKey,
    ...createAnthropicConfig(pl),
  };
}
