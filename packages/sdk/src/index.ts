/**
 * PromptLens SDK — minimal helper to point an OpenAI or Anthropic client at
 * the PromptLens proxy. Drop the result into your client constructor and
 * every request is logged and attributed automatically.
 */

export interface PromptLensConfig {
  apiKey: string;
  /**
   * Override for self-hosted proxies. Defaults to the public PromptLens API.
   */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.promptlens.dev";

function resolveBase(config: PromptLensConfig): string {
  const base = config.baseUrl ?? DEFAULT_BASE_URL;
  return base.replace(/\/$/, "");
}

/**
 * Returns config you can spread into the OpenAI client constructor:
 *
 *   import OpenAI from "openai";
 *   import { createOpenAIConfig } from "promptlens";
 *
 *   const openai = new OpenAI({
 *     apiKey: process.env.OPENAI_API_KEY,
 *     ...createOpenAIConfig({ apiKey: process.env.PROMPTLENS_KEY }),
 *   });
 */
export function createOpenAIConfig(config: PromptLensConfig): {
  baseURL: string;
  defaultHeaders: { "x-promptlens-key": string };
} {
  return {
    baseURL: `${resolveBase(config)}/openai/v1`,
    defaultHeaders: {
      "x-promptlens-key": config.apiKey,
    },
  };
}

/**
 * Returns config for the Anthropic SDK:
 *
 *   import Anthropic from "@anthropic-ai/sdk";
 *   import { createAnthropicConfig } from "promptlens";
 *
 *   const anthropic = new Anthropic({
 *     apiKey: process.env.ANTHROPIC_API_KEY,
 *     ...createAnthropicConfig({ apiKey: process.env.PROMPTLENS_KEY }),
 *   });
 */
export function createAnthropicConfig(config: PromptLensConfig): {
  baseURL: string;
  defaultHeaders: { "x-promptlens-key": string };
} {
  return {
    baseURL: `${resolveBase(config)}/anthropic/v1`,
    defaultHeaders: {
      "x-promptlens-key": config.apiKey,
    },
  };
}
