import { getServiceClient } from "../utils/supabase.js";

/**
 * Sum USD cost for a feature tag in the current calendar month (UTC).
 */
export async function getMonthlyFeatureSpend(
  apiKeyId: string,
  featureTag: string
): Promise<number> {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("requests")
    .select("cost_usd")
    .eq("api_key_id", apiKeyId)
    .eq("feature_tag", featureTag)
    .gte("timestamp", start.toISOString());

  if (error) {
    console.error("[governance] spend query failed:", error.message);
    return 0;
  }

  let total = 0;
  for (const row of data ?? []) {
    const cost = row.cost_usd;
    total += typeof cost === "number" ? cost : parseFloat(String(cost)) || 0;
  }
  return total;
}
