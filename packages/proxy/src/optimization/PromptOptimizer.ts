/**
 * Context-aware prompt optimizer.
 *
 * Unlike the original TokenGuard passes (uniform compression for everything),
 * this compresses by task complexity: aggressive for simple tasks, light for
 * moderate ones, and hands-off for complex tasks where full context matters.
 */
import { estimateTokens } from "./compress.js";
import type { TaskComplexity } from "./complexity.js";

export type OptimizationStrategy = "aggressive" | "moderate" | "preserve";

export interface OptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  originalTokenEstimate: number;
  optimizedTokenEstimate: number;
  reductionPct: number;
  strategy: OptimizationStrategy;
  techniquesApplied: string[];
}

interface Technique {
  name: string;
  apply: (text: string) => string;
}

// --- Individual techniques (each pure; name shows up in metrics) -----------

const removeXmlComments: Technique = {
  name: "comment_removal",
  apply: (t) => t.replace(/<!--[\s\S]*?-->/g, ""),
};

const collapseBlankLines: Technique = {
  name: "blank_line_collapse",
  apply: (t) => t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"),
};

const removeFillerPhrases: Technique = {
  name: "filler_phrase_removal",
  apply: (t) =>
    t
      .replace(
        /\b(please|kindly|feel free to|as an ai( language model)?,?|i'?d be happy to|certainly!?|of course!?)\b/gi,
        ""
      )
      .replace(/[ \t]{2,}/g, " "),
};

const removeRoleBoilerplate: Technique = {
  name: "role_boilerplate_removal",
  apply: (t) =>
    t.replace(
      /^\s*you are (an?\s+)?(very\s+)?(helpful|intelligent|advanced|expert)?\s*(ai\s+)?(assistant|language model|chatbot|model)(\s+(that|who|designed to))?\s*/i,
      "You "
    ),
};

const inlineShortBulletLists: Technique = {
  name: "bullet_list_inlining",
  apply: (text) => {
    // Convert runs of 2–3 short bullets into one comma-separated line.
    return text.replace(
      /(?:^|\n)((?:[ \t]*[-*•][ \t]+[^\n]{1,60}\n?){2,3})(?=\n|$)/g,
      (match, group: string) => {
        const items = group
          .split("\n")
          .map((line) => line.replace(/^[ \t]*[-*•][ \t]+/, "").trim())
          .filter(Boolean);
        if (items.length < 2 || items.length >= 4) return match;
        return `\n${items.join(", ")}\n`;
      }
    );
  },
};

const removeSummaryHeaders: Technique = {
  name: "summary_header_removal",
  apply: (t) =>
    t.replace(/^[ \t]*(in conclusion|to summarize|in summary)[:,]?[ \t]*$/gim, ""),
};

const stripGreetingsAndSignoffs: Technique = {
  name: "greeting_signoff_removal",
  apply: (t) =>
    t
      .replace(/^\s*(hi|hello|hey|greetings|good (morning|afternoon|evening))[\s,!.]+/i, "")
      .replace(/\s*(thanks( in advance)?|thank you( in advance)?|cheers|best regards)[!.,]?\s*$/i, ""),
};

const STRATEGY_TECHNIQUES: Record<OptimizationStrategy, Technique[]> = {
  aggressive: [
    removeXmlComments,
    removeRoleBoilerplate,
    removeFillerPhrases,
    inlineShortBulletLists,
    removeSummaryHeaders,
    stripGreetingsAndSignoffs,
    collapseBlankLines,
  ],
  moderate: [removeXmlComments, removeFillerPhrases, collapseBlankLines],
  preserve: [stripGreetingsAndSignoffs],
};

export function strategyFor(complexity: TaskComplexity): OptimizationStrategy {
  switch (complexity) {
    case "simple":
      return "aggressive";
    case "moderate":
      return "moderate";
    case "complex":
      return "preserve";
  }
}

export class PromptOptimizer {
  optimize(
    prompt: string,
    complexity: TaskComplexity,
    _provider: "openai" | "anthropic"
  ): OptimizationResult {
    const strategy = strategyFor(complexity);
    const techniquesApplied: string[] = [];
    let out = prompt;

    for (const technique of STRATEGY_TECHNIQUES[strategy]) {
      const before = out;
      out = technique.apply(out);
      if (out !== before) techniquesApplied.push(technique.name);
    }
    out = out
      .split("\n")
      .map((line) => line.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/g, ""))
      .join("\n")
      .trim();

    const originalTokenEstimate = estimateTokens(prompt);
    const optimizedTokenEstimate = estimateTokens(out);
    const reductionPct =
      originalTokenEstimate > 0
        ? Math.round(
            ((originalTokenEstimate - optimizedTokenEstimate) /
              originalTokenEstimate) *
              100
          )
        : 0;

    // Never return a degenerate rewrite: if we somehow stripped >90% of a
    // non-trivial prompt, something matched too broadly — fall back to original.
    if (originalTokenEstimate > 50 && reductionPct > 90) {
      return {
        originalPrompt: prompt,
        optimizedPrompt: prompt,
        originalTokenEstimate,
        optimizedTokenEstimate: originalTokenEstimate,
        reductionPct: 0,
        strategy,
        techniquesApplied: [],
      };
    }

    return {
      originalPrompt: prompt,
      optimizedPrompt: out,
      originalTokenEstimate,
      optimizedTokenEstimate,
      reductionPct,
      strategy,
      techniquesApplied,
    };
  }
}
