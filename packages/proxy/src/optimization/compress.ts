/**
 * Rule-based prompt compression (from TokenGuard's local optimizer).
 * Safe, deterministic rewrites — no LLM call in the hot path.
 */

/** Rough tokens ≈ chars / 4 (good enough for savings estimates). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface RulePass {
  apply: (text: string) => string;
}

const PASSES: RulePass[] = [
  {
    apply: (t) =>
      t.replace(
        /^\s*(hi|hello|hey|greetings|good (morning|afternoon|evening))[\s,!.]+/i,
        ""
      ),
  },
  {
    apply: (t) =>
      t.replace(
        /\b(please|kindly|could you (please )?|would you (please )?|can you (please )?)\b/gi,
        ""
      ),
  },
  {
    apply: (t) =>
      t.replace(
        /\b(i was wondering if|i would like to know|i'?d like to know|i want to know|i need to know)\b/gi,
        ""
      ),
  },
  {
    apply: (t) =>
      t.replace(
        /\s*(thanks( in advance)?|thank you( in advance)?|cheers|appreciate it)[!.,]?\s*$/gi,
        ""
      ),
  },
  {
    apply: (t) =>
      t
        .replace(
          /\b(maybe|perhaps|possibly|sort of|kind of|just|basically|actually|really|very|quite)\b/gi,
          ""
        )
        .replace(/\bi think\b/gi, ""),
  },
  {
    apply: (t) =>
      t.replace(/\bhelp me (to )?(understand|figure out)\b/gi, "explain"),
  },
  {
    apply: (t) =>
      t
        .replace(/\b(in order to)\b/gi, "to")
        .replace(/\bdue to the fact that\b/gi, "because"),
  },
  {
    apply: (t) => t.replace(/\s+/g, " ").trim(),
  },
  {
    apply: (t) => t.replace(/[!?.]{2,}$/g, (m) => m[0]!),
  },
];

export interface CompressResult {
  original: string;
  optimized: string;
  tokensSavedEstimate: number;
  changed: boolean;
}

export function compressPromptText(input: string): CompressResult {
  const original = input ?? "";
  let optimized = original;

  for (const pass of PASSES) {
    optimized = pass.apply(optimized);
  }

  if (!optimized.trim()) {
    optimized = original.trim();
  }

  if (optimized.length > 0) {
    optimized = optimized[0]!.toUpperCase() + optimized.slice(1);
  }

  const tokensSavedEstimate = Math.max(
    0,
    estimateTokens(original) - estimateTokens(optimized)
  );

  return {
    original,
    optimized,
    tokensSavedEstimate,
    changed: optimized !== original,
  };
}
