/**
 * Personalized prompt suggestions.
 *
 * Phase 1: a thin wrapper over the rule-based linter that returns a
 * forward-compatible response shape. The route and the dashboard consume this
 * shape today; Phase 2 fills in retrieval + an LLM rewrite **inside this
 * function** (retrieve the subject's past accepted rewrites, embed, build a
 * few-shot prompt, generate) without changing the API or the UI.
 */

import { lintPrompt, type PromptLintResult } from "../optimization/promptLint.js";

export interface SubjectRef {
  id: string;
  kind: "user" | "key" | "local";
}

export interface Exemplar {
  /** Cosine similarity to the current draft (0..1). */
  similarity: number;
  /** Truncated previews — populated only when raw storage is enabled. */
  draft_preview: string;
  final_preview: string;
}

/** Superset of PromptLintResult so existing lint consumers keep working. */
export interface PersonalizedSuggestResult extends PromptLintResult {
  /** True once a personalized (retrieval-based) result is produced. */
  personalized: boolean;
  /** Where the suggestion came from. */
  source: "rules" | "retrieval";
  /** The user's own similar past rewrites used as few-shot exemplars. */
  exemplars: Exemplar[];
  /** A concrete suggested rewrite (Phase 2); null when rules-only. */
  rewrite: string | null;
}

export async function personalizedSuggest(
  _subject: SubjectRef,
  prompt: string
): Promise<PersonalizedSuggestResult> {
  const base = lintPrompt(prompt);

  // --- Phase 2 drops in here (signature already async) -----------------------
  // const exemplars = await retrieveSimilarRevisions(_subject, prompt);
  // if (exemplars.length) return { ...base, personalized: true,
  //   source: "retrieval", exemplars, rewrite: await generateRewrite(...) };

  return {
    ...base,
    personalized: false,
    source: "rules",
    exemplars: [],
    rewrite: null,
  };
}
