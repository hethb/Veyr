import { compressPromptText } from "./compress.js";
import { PromptOptimizer } from "./PromptOptimizer.js";
import type { TaskComplexity } from "./complexity.js";

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => {
        const part = asObject(p);
        return typeof part?.text === "string" ? part.text : "";
      })
      .join("");
  }
  return "";
}

function setMessageText(msg: Record<string, unknown>, text: string): void {
  if (typeof msg.content === "string") {
    msg.content = text;
    return;
  }
  if (Array.isArray(msg.content)) {
    const parts = msg.content as unknown[];
    if (parts.length === 0) {
      msg.content = text;
      return;
    }
    const first = asObject(parts[0]);
    if (first && typeof first.text === "string") {
      first.text = text;
    }
  }
}

export interface TransformOpenAIOptions {
  compress?: boolean;
  /** Task complexity from the quick heuristic; selects the compression strategy. */
  complexity?: TaskComplexity;
  maxCompletionTokens?: number | null;
}

export interface TransformOpenAIResult {
  body: Record<string, unknown>;
  compressionApplied: boolean;
  tokensSavedEstimate: number;
  optimizationStrategy: string | null;
  techniquesApplied: string[];
  originalPromptTokens: number;
  optimizedPromptTokens: number;
}

/**
 * Optionally compresses system/user string messages and caps max_tokens.
 */
export function transformOpenAIBody(
  rawBody: unknown,
  options: TransformOpenAIOptions
): TransformOpenAIResult {
  const body = asObject(rawBody);
  if (!body) {
    return {
      body: {},
      compressionApplied: false,
      tokensSavedEstimate: 0,
      optimizationStrategy: null,
      techniquesApplied: [],
      originalPromptTokens: 0,
      optimizedPromptTokens: 0,
    };
  }

  const out = structuredClone(body) as Record<string, unknown>;
  let tokensSavedEstimate = 0;
  let compressionApplied = false;
  let optimizationStrategy: string | null = null;
  let techniquesApplied: string[] = [];
  let originalPromptTokens = 0;
  let optimizedPromptTokens = 0;

  if (options.compress) {
    const messages = Array.isArray(out.messages) ? out.messages : [];
    const optimizer = options.complexity ? new PromptOptimizer() : null;
    for (const m of messages) {
      const msg = asObject(m);
      if (!msg) continue;
      const role = msg.role;
      if (role !== "system" && role !== "user") continue;

      const text = messageText(msg.content);
      if (!text.trim()) continue;

      if (optimizer && options.complexity) {
        const result = optimizer.optimize(text, options.complexity, "openai");
        if (role === "system") {
          optimizationStrategy = result.strategy;
          originalPromptTokens = result.originalTokenEstimate;
          optimizedPromptTokens = result.optimizedTokenEstimate;
        }
        for (const technique of result.techniquesApplied) {
          if (!techniquesApplied.includes(technique)) {
            techniquesApplied.push(technique);
          }
        }
        if (result.optimizedPrompt !== text && result.reductionPct > 0) {
          setMessageText(msg, result.optimizedPrompt);
          tokensSavedEstimate +=
            result.originalTokenEstimate - result.optimizedTokenEstimate;
          compressionApplied = true;
        }
      } else {
        const result = compressPromptText(text);
        if (result.changed) {
          setMessageText(msg, result.optimized);
          tokensSavedEstimate += result.tokensSavedEstimate;
          compressionApplied = true;
        }
      }
    }
  }

  if (
    options.maxCompletionTokens != null &&
    options.maxCompletionTokens > 0
  ) {
    const current =
      typeof out.max_tokens === "number" ? out.max_tokens : undefined;
    out.max_tokens =
      current != null
        ? Math.min(current, options.maxCompletionTokens)
        : options.maxCompletionTokens;
  }

  return {
    body: out,
    compressionApplied,
    tokensSavedEstimate,
    optimizationStrategy,
    techniquesApplied,
    originalPromptTokens,
    optimizedPromptTokens,
  };
}
