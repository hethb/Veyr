import { getMonthlyFeatureSpend as storeMonthlyFeatureSpend } from "../storage/store.js";

/**
 * Sum USD cost for a feature tag in the current calendar month (UTC).
 */
export async function getMonthlyFeatureSpend(
  apiKeyId: string,
  featureTag: string
): Promise<number> {
  try {
    return storeMonthlyFeatureSpend(apiKeyId, featureTag);
  } catch (err) {
    console.error("[governance] spend query failed:", err);
    return 0;
  }
}
