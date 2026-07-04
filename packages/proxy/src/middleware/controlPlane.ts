import type { NextFunction, Request, Response } from "express";
import { getFeaturePolicy } from "../governance/policies.js";
import { getMonthlyFeatureSpend } from "../governance/spend.js";
import { transformAnthropicBody } from "../optimization/transformAnthropic.js";
import { transformOpenAIBody } from "../optimization/transformOpenAI.js";
import { isCompressionEnabledByDefault } from "../config.js";
import {
  extractPromptTexts,
  quickComplexityEstimate,
  type TaskComplexity,
} from "../optimization/complexity.js";
import { recordAndShouldAutoCache } from "../optimization/cacheHeuristics.js";
import { estimateTokens } from "../optimization/compress.js";
import { sha256 } from "../utils/hash.js";

declare module "express-serve-static-core" {
  interface Request {
    veyr?: {
      compressionApplied: boolean;
      tokensSavedEstimate: number;
      /** True when we injected provider-side prompt caching into the request. */
      cachingApplied?: boolean;
      complexity?: TaskComplexity;
      optimizationStrategy?: string | null;
      techniquesApplied?: string[];
      originalPromptTokens?: number;
      optimizedPromptTokens?: number;
    };
  }
}

function wantsCompression(req: Request, policyCompress: boolean): boolean {
  const header = req.header("x-veyr-compress");
  if (header === "1" || header === "true") return true;
  if (header === "0" || header === "false") return false;
  if (policyCompress) return true;
  return isCompressionEnabledByDefault();
}

function wantsCaching(req: Request, policyCache: boolean): boolean {
  const header = req.header("x-veyr-cache");
  if (header === "1" || header === "true") return true;
  if (header === "0" || header === "false") return false;
  return policyCache;
}

function headerMaxTokens(req: Request): number | null {
  const raw = req.header("x-veyr-max-tokens");
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Layer 2 + 3: enforce budgets, compress prompts, cap max_tokens before upstream.
 */
export async function controlPlane(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKeyId = req.apiKeyId;
  if (!apiKeyId) {
    next();
    return;
  }

  const featureTag = req.featureTag ?? "untagged";
  const policy = await getFeaturePolicy(apiKeyId, featureTag);

  if (policy?.monthly_budget_usd != null && policy.monthly_budget_usd > 0) {
    const spend = await getMonthlyFeatureSpend(apiKeyId, featureTag);
    if (spend >= policy.monthly_budget_usd) {
      res.status(429).json({
        error: "feature_budget_exceeded",
        message: `Feature "${featureTag}" has reached its monthly budget of $${policy.monthly_budget_usd.toFixed(2)}.`,
        feature_tag: featureTag,
        spend_usd: Math.round(spend * 100) / 100,
        budget_usd: policy.monthly_budget_usd,
      });
      return;
    }
  }

  const compress = wantsCompression(req, policy?.compress_prompts ?? false);
  let enablePromptCaching = wantsCaching(req, policy?.enable_prompt_caching ?? false);

  const isAnthropicRoute = req.baseUrl.includes("/anthropic");
  const provider = isAnthropicRoute ? ("anthropic" as const) : ("openai" as const);

  // Quick local complexity estimate (no LLM call) drives the compression
  // strategy: aggressive for simple, light for moderate, hands-off for complex.
  const texts = extractPromptTexts(req.body, provider);
  const complexity = quickComplexityEstimate(
    texts.systemPrompt,
    texts.firstUserMessage
  );

  // Auto-inject Anthropic caching when the same >500-token system prompt has
  // been seen >3 times in the last hour — repeated prefixes are pure savings.
  if (isAnthropicRoute && !enablePromptCaching && texts.systemPrompt) {
    if (
      recordAndShouldAutoCache(
        sha256(texts.systemPrompt),
        estimateTokens(texts.systemPrompt)
      )
    ) {
      enablePromptCaching = true;
    }
  }
  const maxFromHeader = headerMaxTokens(req);
  const maxFromPolicy = policy?.max_completion_tokens ?? null;
  const maxCompletionTokens =
    maxFromHeader != null && maxFromPolicy != null
      ? Math.min(maxFromHeader, maxFromPolicy)
      : maxFromHeader ?? maxFromPolicy;

  const isAnthropic = isAnthropicRoute;

  if (isAnthropic) {
    const result = transformAnthropicBody(req.body, {
      compress,
      complexity,
      maxCompletionTokens,
      enablePromptCaching,
    });
    req.body = result.body;
    req.veyr = {
      compressionApplied: result.compressionApplied,
      tokensSavedEstimate: result.tokensSavedEstimate,
      cachingApplied: result.cachingApplied,
      complexity,
      optimizationStrategy: result.optimizationStrategy,
      techniquesApplied: result.techniquesApplied,
      originalPromptTokens: result.originalPromptTokens,
      optimizedPromptTokens: result.optimizedPromptTokens,
    };
  } else {
    // OpenAI's prompt cache is automatic above ~1024 tokens of stable prefix —
    // no marker injection needed. We still surface the intent on the response
    // so observability is consistent across providers.
    const result = transformOpenAIBody(req.body, {
      compress,
      complexity,
      maxCompletionTokens,
    });
    req.body = result.body;
    req.veyr = {
      compressionApplied: result.compressionApplied,
      tokensSavedEstimate: result.tokensSavedEstimate,
      cachingApplied: enablePromptCaching,
      complexity,
      optimizationStrategy: result.optimizationStrategy,
      techniquesApplied: result.techniquesApplied,
      originalPromptTokens: result.originalPromptTokens,
      optimizedPromptTokens: result.optimizedPromptTokens,
    };
  }

  if (req.veyr.compressionApplied) {
    res.setHeader("x-veyr-compression", "applied");
    res.setHeader(
      "x-veyr-tokens-saved-estimate",
      String(req.veyr.tokensSavedEstimate)
    );
  }
  res.setHeader("x-veyr-complexity", complexity);
  if (req.veyr.optimizationStrategy) {
    res.setHeader("x-veyr-strategy", req.veyr.optimizationStrategy);
  }
  if (req.veyr.cachingApplied) {
    res.setHeader(
      "x-veyr-cache",
      isAnthropic ? "applied" : "passthrough"
    );
  }

  next();
}
