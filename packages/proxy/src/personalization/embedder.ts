/**
 * Embedding seam for Phase-2 retrieval personalization.
 *
 * Phase 1 ships only the interface + a no-op implementation so the rest of the
 * code (storage column, suggest path) can be wired without committing to a
 * backend. Phase 2 swaps in a privacy-first embedder — a local model via a
 * Python `sentence-transformers`/`fastembed` sidecar, or JS `transformers.js`
 * to stay single-process — so prompt text never leaves the host.
 */

export interface Embedder {
  /** Returns one vector per input text. */
  embed(texts: string[]): Promise<Float32Array[]>;
  /** Dimensionality of the produced vectors (0 if not yet implemented). */
  readonly dimensions: number;
}

/** Placeholder until Phase 2. Produces no vectors. */
export class NoopEmbedder implements Embedder {
  readonly dimensions = 0;
  async embed(_texts: string[]): Promise<Float32Array[]> {
    return [];
  }
}

let active: Embedder = new NoopEmbedder();

/** Swap the active embedder (Phase 2 wires the real one here). */
export function setEmbedder(e: Embedder): void {
  active = e;
}

export function getEmbedder(): Embedder {
  return active;
}
