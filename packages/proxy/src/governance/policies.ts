import {
  getFeaturePolicy as storeGetFeaturePolicy,
  type FeaturePolicy,
} from "../storage/store.js";

export type { FeaturePolicy };

const policyCache = new Map<string, { policy: FeaturePolicy | null; at: number }>();
const CACHE_MS = 30_000;

function cacheKey(apiKeyId: string, featureTag: string): string {
  return `${apiKeyId}:${featureTag}`;
}

export async function getFeaturePolicy(
  apiKeyId: string,
  featureTag: string
): Promise<FeaturePolicy | null> {
  const key = cacheKey(apiKeyId, featureTag);
  const hit = policyCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return hit.policy;
  }

  let policy: FeaturePolicy | null = null;
  try {
    policy = storeGetFeaturePolicy(apiKeyId, featureTag);
  } catch (err) {
    console.error("[governance] policy lookup failed:", err);
    return null;
  }

  policyCache.set(key, { policy, at: Date.now() });
  return policy;
}

export function invalidatePolicyCache(apiKeyId: string, featureTag: string): void {
  policyCache.delete(cacheKey(apiKeyId, featureTag));
}
