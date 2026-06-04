import { Router, type Request, type Response } from "express";
import { dashboardAuth } from "../middleware/dashboardAuth.js";
import { invalidatePolicyCache } from "../governance/policies.js";
import { getServiceClient } from "../utils/supabase.js";

export const policiesRouter: Router = Router();
policiesRouter.use(dashboardAuth);

async function userOwnsApiKey(userId: string, apiKeyId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id")
    .eq("id", apiKeyId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

// GET /api/policies?api_key_id=...
policiesRouter.get("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const apiKeyId = typeof req.query.api_key_id === "string" ? req.query.api_key_id : "";
  if (!apiKeyId) {
    res.status(400).json({ error: "api_key_id query param required" });
    return;
  }

  if (!(await userOwnsApiKey(userId, apiKeyId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("feature_policies")
    .select("*")
    .eq("api_key_id", apiKeyId)
    .order("feature_tag");

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data ?? []);
});

// PUT /api/policies — upsert one policy
policiesRouter.put("/", async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const apiKeyId = typeof req.body?.api_key_id === "string" ? req.body.api_key_id : "";
  const featureTag = typeof req.body?.feature_tag === "string" ? req.body.feature_tag.trim() : "";
  if (!apiKeyId || !featureTag) {
    res.status(400).json({ error: "api_key_id and feature_tag required" });
    return;
  }

  if (!(await userOwnsApiKey(userId, apiKeyId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const row = {
    api_key_id: apiKeyId,
    feature_tag: featureTag.slice(0, 64),
    monthly_budget_usd:
      typeof req.body?.monthly_budget_usd === "number" ? req.body.monthly_budget_usd : null,
    max_completion_tokens:
      typeof req.body?.max_completion_tokens === "number"
        ? req.body.max_completion_tokens
        : null,
    compress_prompts: Boolean(req.body?.compress_prompts),
    fallback_model:
      typeof req.body?.fallback_model === "string" ? req.body.fallback_model : null,
    rate_limit_per_minute:
      typeof req.body?.rate_limit_per_minute === "number"
        ? req.body.rate_limit_per_minute
        : null,
    updated_at: new Date().toISOString(),
  };

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("feature_policies")
    .upsert(row, { onConflict: "api_key_id,feature_tag" })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  invalidatePolicyCache(apiKeyId, featureTag);
  res.json(data);
});

// DELETE /api/policies/:id
policiesRouter.delete("/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const supabase = getServiceClient();
  const { data: existing } = await supabase
    .from("feature_policies")
    .select("api_key_id, feature_tag")
    .eq("id", req.params.id)
    .maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (!(await userOwnsApiKey(userId, existing.api_key_id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { error } = await supabase.from("feature_policies").delete().eq("id", req.params.id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  invalidatePolicyCache(existing.api_key_id, existing.feature_tag);
  res.status(204).end();
});
