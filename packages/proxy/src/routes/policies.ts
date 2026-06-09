import { Router, type Request, type Response } from "express";
import { invalidatePolicyCache } from "../governance/policies.js";
import {
  apiKeyBelongsToUser,
  deletePolicyById,
  getPolicyById,
  listPolicies,
  upsertPolicy,
} from "../storage/store.js";

export const policiesRouter: Router = Router();

/** When auth is on, ensure the caller owns the api key they're operating on. */
function denyIfNotOwned(req: Request, res: Response, apiKeyId: string): boolean {
  if (req.userId && !apiKeyBelongsToUser(apiKeyId, req.userId)) {
    res.status(403).json({ error: "Forbidden" });
    return true;
  }
  return false;
}

// GET /api/policies?api_key_id=...
policiesRouter.get("/", (req: Request, res: Response): void => {
  const apiKeyId = typeof req.query.api_key_id === "string" ? req.query.api_key_id : "";
  if (!apiKeyId) {
    res.status(400).json({ error: "api_key_id query param required" });
    return;
  }
  if (denyIfNotOwned(req, res, apiKeyId)) return;

  try {
    res.json(listPolicies(apiKeyId));
  } catch (err) {
    console.error("[policies] list failed:", err);
    res.status(500).json({ error: "Failed to list policies" });
  }
});

// PUT /api/policies — upsert one policy
policiesRouter.put("/", (req: Request, res: Response): void => {
  const apiKeyId = typeof req.body?.api_key_id === "string" ? req.body.api_key_id : "";
  const featureTag = typeof req.body?.feature_tag === "string" ? req.body.feature_tag.trim() : "";
  if (!apiKeyId || !featureTag) {
    res.status(400).json({ error: "api_key_id and feature_tag required" });
    return;
  }
  if (denyIfNotOwned(req, res, apiKeyId)) return;

  try {
    const policy = upsertPolicy({
      apiKeyId,
      featureTag: featureTag.slice(0, 64),
      monthlyBudgetUsd:
        typeof req.body?.monthly_budget_usd === "number" ? req.body.monthly_budget_usd : null,
      maxCompletionTokens:
        typeof req.body?.max_completion_tokens === "number"
          ? req.body.max_completion_tokens
          : null,
      compressPrompts: Boolean(req.body?.compress_prompts),
      fallbackModel:
        typeof req.body?.fallback_model === "string" ? req.body.fallback_model : null,
      rateLimitPerMinute:
        typeof req.body?.rate_limit_per_minute === "number"
          ? req.body.rate_limit_per_minute
          : null,
      enablePromptCaching: Boolean(req.body?.enable_prompt_caching),
    });

    invalidatePolicyCache(apiKeyId, featureTag.slice(0, 64));
    res.json(policy);
  } catch (err) {
    console.error("[policies] upsert failed:", err);
    res.status(500).json({ error: "Failed to save policy" });
  }
});

// DELETE /api/policies/:id
policiesRouter.delete("/:id", (req: Request, res: Response): void => {
  try {
    const existing = getPolicyById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (denyIfNotOwned(req, res, existing.api_key_id)) return;

    deletePolicyById(req.params.id);
    invalidatePolicyCache(existing.api_key_id, existing.feature_tag);
    res.status(204).end();
  } catch (err) {
    console.error("[policies] delete failed:", err);
    res.status(500).json({ error: "Failed to delete policy" });
  }
});
