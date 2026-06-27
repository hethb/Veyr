/**
 * Per-user retrieval over a subject's own past rewrites — the heart of
 * "personalization via retrieval" (see docs/prompt-personalization.md).
 *
 * Backend: in-process TF-IDF cosine, computed on the fly over the user's own
 * history (tens–hundreds of rows). No model, no Python, no network — prompt
 * text never leaves the host. The Embedder seam (embedder.ts) remains for a
 * later neural upgrade without changing callers.
 *
 * Rows only exist when STORE_PROMPTS has been collecting prompt_revisions, so
 * retrieval is naturally inert on privacy-first deployments that store nothing.
 */

import { getRecentRevisions } from "../storage/store.js";

export interface RevisionMatch {
  /** Cosine similarity between the current draft and this past draft (0..1). */
  similarity: number;
  /** Full text — internal use (e.g. few-shot rewrite). Not sent to clients. */
  draft: string;
  final: string;
}

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);
}

function termFreq(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function norm(vec: Map<string, number>): number {
  let s = 0;
  for (const w of vec.values()) s += w * w;
  return Math.sqrt(s);
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  // Iterate the smaller map for the dot product.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const ow = large.get(t);
    if (ow) dot += w * ow;
  }
  const na = norm(a);
  const nb = norm(b);
  return na && nb ? dot / (na * nb) : 0;
}

/**
 * Returns the subject's most similar past drafts (and the finals they accepted),
 * ranked by TF-IDF cosine to `query`. Empty when the subject has no stored
 * revisions or nothing clears `minSimilarity`.
 */
export function retrieveSimilarRevisions(
  subjectId: string,
  query: string,
  k = 3,
  minSimilarity = 0.08
): RevisionMatch[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const revisions = getRecentRevisions(subjectId, 200);
  if (revisions.length === 0) return [];

  const docTokens = revisions.map((r) => tokenize(r.draft_prompt));

  // IDF over the subject's own corpus (smoothed).
  const df = new Map<string, number>();
  for (const doc of docTokens) {
    for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = docTokens.length;
  const idf = (t: string): number => Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;

  const tfidf = (tokens: string[]): Map<string, number> => {
    const tf = termFreq(tokens);
    const len = tokens.length || 1;
    const v = new Map<string, number>();
    for (const [t, f] of tf) v.set(t, (f / len) * idf(t));
    return v;
  };

  const queryVec = tfidf(queryTokens);

  return revisions
    .map((r, i) => ({
      similarity: cosine(queryVec, tfidf(docTokens[i])),
      draft: r.draft_prompt,
      final: r.final_prompt,
    }))
    .filter((m) => m.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
