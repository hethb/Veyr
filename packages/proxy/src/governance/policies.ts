import { getServiceClient } from "../utils/supabase.js";

export interface FeaturePolicy {
  id: string;
  api_key_id: string;
  feature_tag: string;
  monthly_budget_usd: number | null;
  max_completion_tokens: number | null;
  compress_prompts: boolean;
  fallback_model: string | null;
  rate_limit_per_minute: number | null;
}

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

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("feature_policies")
    .select(
      "id, api_key_id, feature_tag, monthly_budget_usd, max_completion_tokens, compress_prompts, fallback_model, rate_limit_per_minute"
    )
    .eq("api_key_id", apiKeyId)
    .eq("feature_tag", featureTag)
    .maybeSingle();

  if (error) {
    console.error("[governance] policy lookup failed:", error.message);
    return null;
  }

  const policy = (data as FeaturePolicy | null) ?? null;
  policyCache.set(key, { policy, at: Date.now() });
  return policy;
}

export function invalidatePolicyCache(apiKeyId: string, featureTag: string): void {
  policyCache.delete(cacheKey(apiKeyId, featureTag));
}
