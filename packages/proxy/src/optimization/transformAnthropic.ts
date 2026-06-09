import { compressPromptText } from "./compress.js";

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export interface TransformAnthropicOptions {
  compress?: boolean;
  maxCompletionTokens?: number | null;
  /**
   * When true, wrap a long enough system prompt as a content block with
   * `cache_control: { type: "ephemeral" }` so Anthropic serves it from cache
   * on subsequent calls. Skipped silently when the prompt is below the
   * ~1024-token minimum or already has cache_control set.
   */
  enablePromptCaching?: boolean;
}

export interface TransformAnthropicResult {
  body: Record<string, unknown>;
  compressionApplied: boolean;
  tokensSavedEstimate: number;
  /** True when we injected cache_control into the request. */
  cachingApplied: boolean;
}

/** ~4 chars per token; Anthropic's ephemeral cache minimum is 1024 tokens. */
const CACHE_MIN_CHARS = 1024 * 4;

function hasCacheControl(blocks: unknown): boolean {
  if (!Array.isArray(blocks)) return false;
  for (const b of blocks) {
    const obj = asObject(b);
    if (obj && obj.cache_control) return true;
  }
  return false;
}

/**
 * Wraps the existing `system` value as a single text block with cache_control.
 * Anthropic accepts both a bare string and an array of content blocks; the
 * block form is the only one that supports cache markers.
 */
function applyCacheControl(out: Record<string, unknown>): boolean {
  const sys = out.system;

  if (typeof sys === "string") {
    if (sys.length < CACHE_MIN_CHARS) return false;
    out.system = [
      {
        type: "text",
        text: sys,
        cache_control: { type: "ephemeral" },
      },
    ];
    return true;
  }

  if (Array.isArray(sys)) {
    // Already structured. Skip if the user is managing cache_control themselves.
    if (hasCacheControl(sys)) return false;
    let totalChars = 0;
    for (const b of sys) {
      const obj = asObject(b);
      if (obj && typeof obj.text === "string") totalChars += obj.text.length;
    }
    if (totalChars < CACHE_MIN_CHARS) return false;
    // Anthropic caches up to and including the marker, so set it on the LAST
    // block — everything before becomes the cacheable prefix.
    const last = asObject(sys[sys.length - 1]);
    if (!last) return false;
    last.cache_control = { type: "ephemeral" };
    return true;
  }

  return false;
}

export function transformAnthropicBody(
  rawBody: unknown,
  options: TransformAnthropicOptions
): TransformAnthropicResult {
  const body = asObject(rawBody);
  if (!body) {
    return {
      body: {},
      compressionApplied: false,
      tokensSavedEstimate: 0,
      cachingApplied: false,
    };
  }

  const out = structuredClone(body) as Record<string, unknown>;
  let tokensSavedEstimate = 0;
  let compressionApplied = false;
  let cachingApplied = false;

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

  // Caching runs AFTER compression so we mark the final (smaller) prefix and
  // get an accurate token estimate for the cached block.
  if (options.enablePromptCaching) {
    cachingApplied = applyCacheControl(out);
    if (cachingApplied) {
      const sys = out.system;
      let chars = 0;
      if (Array.isArray(sys)) {
        for (const b of sys) {
          const obj = asObject(b);
          if (obj && typeof obj.text === "string") chars += obj.text.length;
        }
      }
      // First call pays ~1.25x to write; subsequent reads cost ~0.1x. We
      // optimistically credit the steady-state saving (~90%) so the
      // x-promptlens-tokens-saved-estimate header reflects what a warm cache
      // saves per call. This is an upper-bound estimate by design.
      tokensSavedEstimate += Math.floor((chars / 4) * 0.9);
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

  return { body: out, compressionApplied, tokensSavedEstimate, cachingApplied };
}
