/**
 * Flags proxied requests that look like background jobs — OpenAI's Batch API
 * runs them at a 50% discount with up-to-24h turnaround (Part 7).
 * Detection only; the proxy never reroutes traffic on its own.
 */

const BACKGROUND_TAG_RE = /(eval|batch|report|analy[sz]e|classif)/i;

export class BatchApiDetector {
  isBatchCandidate(
    requestBody: unknown,
    featureTag: string,
    hour: number
  ): boolean {
    const body =
      requestBody && typeof requestBody === "object" && !Array.isArray(requestBody)
        ? (requestBody as Record<string, unknown>)
        : null;
    if (!body) return false;

    // Streaming requests have a user actively waiting — never candidates.
    if (body.stream === true) return false;

    const tagSuggestsBackground = BACKGROUND_TAG_RE.test(featureTag);
    const isOffHours = hour >= 23 || hour < 7;

    // Tag signal is the strong one; off-hours alone only counts alongside
    // non-streaming (already established above).
    return tagSuggestsBackground || (isOffHours && body.stream === false);
  }

  suggestion(featureTag: string): string {
    return (
      `Non-streaming requests in "${featureTag}" look like background jobs. ` +
      "OpenAI's Batch API processes them at half price within 24 hours — " +
      "perfect for evals, reports, and analysis tasks."
    );
  }
}
