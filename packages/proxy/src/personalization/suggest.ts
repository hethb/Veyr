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
import { retrieveSimilarRevisions } from "./retrieval.js";
import { generateRewrite } from "./rewrite.js";

export interface SubjectRef {
  id: string;
  kind: "user" | "key" | "local";
}

/** Max characters of exemplar text exposed to clients (full text stays server-side). */
const PREVIEW_CHARS = 160;

function preview(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > PREVIEW_CHARS ? `${t.slice(0, PREVIEW_CHARS)}…` : t;
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
  subject: SubjectRef,
  prompt: string
): Promise<PersonalizedSuggestResult> {
  const base = lintPrompt(prompt);
  const rulesOnly: PersonalizedSuggestResult = {
    ...base,
    personalized: false,
    source: "rules",
    exemplars: [],
    rewrite: null,
  };
  if (!prompt.trim()) return rulesOnly;

  // Retrieval is local + best-effort; never fail the request over it.
  let matches;
  try {
    matches = retrieveSimilarRevisions(subject.id, prompt);
  } catch (err) {
    console.error("[personalization] retrieval failed:", err);
    return rulesOnly;
  }
  if (matches.length === 0) return rulesOnly;

  // Optional LLM rewrite (gated by ENABLE_PROMPT_REWRITE inside generateRewrite).
  const rewrite = await generateRewrite(prompt, matches);

  return {
    ...base,
    personalized: true,
    source: "retrieval",
    exemplars: matches.map((m) => ({
      similarity: Math.round(m.similarity * 100) / 100,
      draft_preview: preview(m.draft),
      final_preview: preview(m.final),
    })),
    rewrite,
  };
}
