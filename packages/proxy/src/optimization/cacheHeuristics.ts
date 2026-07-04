/**
 * Auto-detection for Anthropic prompt-cache injection: when the same system
 * prompt hash appears >3 times within an hour AND the prompt is >500 tokens,
 * inject cache_control even without an explicit header/policy — repeated large
 * prefixes are pure savings.
 *
 * In-memory only (per proxy process); resets on restart, which is fine —
 * the pattern re-establishes within a few calls.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MIN_OCCURRENCES = 4; // ">3 times"
const MIN_TOKENS = 500;
const MAX_TRACKED_HASHES = 5000;

const sightings = new Map<string, number[]>();

export function recordAndShouldAutoCache(
  promptHash: string,
  promptTokenEstimate: number,
  now: number = Date.now()
): boolean {
  if (!promptHash || promptTokenEstimate <= MIN_TOKENS) return false;

  const cutoff = now - WINDOW_MS;
  const previous = (sightings.get(promptHash) ?? []).filter((t) => t >= cutoff);
  previous.push(now);
  sightings.set(promptHash, previous);

  // Bounded memory: drop the oldest entries wholesale when the map grows.
  if (sightings.size > MAX_TRACKED_HASHES) {
    const keys = sightings.keys();
    for (let i = 0; i < 500; i++) {
      const key = keys.next();
      if (key.done) break;
      sightings.delete(key.value);
    }
  }

  return previous.length >= MIN_OCCURRENCES;
}

/** Test hook. */
export function resetCacheHeuristics(): void {
  sightings.clear();
}
