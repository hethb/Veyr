import { compressPromptText } from "./compress.js";

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export interface TransformAnthropicOptions {
  compress?: boolean;
  maxCompletionTokens?: number | null;
}

export interface TransformAnthropicResult {
  body: Record<string, unknown>;
  compressionApplied: boolean;
  tokensSavedEstimate: number;
}

export function transformAnthropicBody(
  rawBody: unknown,
  options: TransformAnthropicOptions
): TransformAnthropicResult {
  const body = asObject(rawBody);
  if (!body) {
    return { body: {}, compressionApplied: false, tokensSavedEstimate: 0 };
  }

  const out = structuredClone(body) as Record<string, unknown>;
  let tokensSavedEstimate = 0;
  let compressionApplied = false;

  if (options.compress) {
    const sys = out.system;
    if (typeof sys === "string" && sys.trim()) {
      const result = compressPromptText(sys);
      if (result.changed) {
        out.system = result.optimized;
        tokensSavedEstimate += result.tokensSavedEstimate;
        compressionApplied = true;
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

  return { body: out, compressionApplied, tokensSavedEstimate };
}
