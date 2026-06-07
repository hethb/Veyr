/**
 * Rule-based system-prompt compression for the optimization preview.
 *
 * Deterministic, no LLM call. Separate from the hot-path `compress.ts` used by
 * the proxy forwarding so we can be more aggressive on stored system prompts.
 */
import { estimateTokens } from "./compress.js";

export interface CompressPromptResult {
  original_tokens: number;
  compressed_tokens: number;
  pct_reduction: number;
  compressed_prompt: string;
}

export function compressSystemPrompt(input: string): CompressPromptResult {
  const original = input ?? "";
  let out = original;

  // 1. Remove XML/HTML comments.
  out = out.replace(/<!--[\s\S]*?-->/g, "");

  // 2. Shorten "You are an AI assistant that ..." boilerplate openings.
  out = out.replace(
    /^\s*you are (an?\s+)?(ai|a helpful|an? intelligent)?\s*(assistant|language model|chatbot)(\s+that)?\s*/i,
    "You "
  );

  // 3. Remove politeness / filler phrases.
  out = out.replace(
    /\b(please|kindly|feel free to|don'?t hesitate to|if you would|i would like you to)\b/gi,
    ""
  );

  // 4. Collapse consecutive blank lines to a single blank line.
  out = out.replace(/[ \t]+\n/g, "\n");
  out = out.replace(/\n{3,}/g, "\n\n");

  // 5. Collapse runs of spaces left behind by the removals.
  out = out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();

  const original_tokens = estimateTokens(original);
  const compressed_tokens = estimateTokens(out);
  const pct_reduction =
    original_tokens > 0
      ? Math.round(((original_tokens - compressed_tokens) / original_tokens) * 100)
      : 0;

  return {
    original_tokens,
    compressed_tokens,
    pct_reduction,
    compressed_prompt: out,
  };
}
