import { Router, type Request, type Response } from "express";
import { apiKeyAuth } from "../middleware/auth.js";
import { controlPlane } from "../middleware/controlPlane.js";
import { featureTag } from "../middleware/featureTag.js";
import { forwardAndCapture } from "../utils/forward.js";
import {
  extractAnthropicSystemPrompt,
  parseAnthropic,
} from "../utils/parseUsage.js";
import { sha256 } from "../utils/hash.js";
import { logRequest } from "../utils/logRequest.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const anthropicRouter: Router = Router();

anthropicRouter.post(
  "/v1/messages",
  apiKeyAuth,
  featureTag,
  controlPlane,
  async (req: Request, res: Response): Promise<void> => {
    const apiKeyId = req.apiKeyId;
    if (!apiKeyId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }

    const systemPrompt = extractAnthropicSystemPrompt(req.body);
    const promptHash = sha256(systemPrompt);
    const requestedModel =
      typeof req.body?.model === "string" ? req.body.model : "unknown";

    try {
      const result = await forwardAndCapture(req, res, ANTHROPIC_URL);
      const usage = parseAnthropic(result.contentType, result.body);

      logRequest({
        apiKeyId,
        model: usage.model ?? requestedModel,
        provider: "anthropic",
        featureTag: req.featureTag ?? "untagged",
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        latencyMs: result.latencyMs,
        status: result.ok ? "success" : "error",
        finishReason: usage.finishReason,
        promptHash,
        errorMessage: result.ok ? null : usage.errorMessage ?? `HTTP ${result.status}`,
        compressionApplied: req.veyr?.compressionApplied,
        tokensSavedEstimate: req.veyr?.tokensSavedEstimate,
        cachedTokens: usage.cachedTokens,
        cacheCreationTokens: usage.cacheCreationTokens,
      });
    } catch (err) {
      console.error("[anthropic] upstream error:", err);
      logRequest({
        apiKeyId,
        model: requestedModel,
        provider: "anthropic",
        featureTag: req.featureTag ?? "untagged",
        promptTokens: 0,
        completionTokens: 0,
        latencyMs: 0,
        status: "error",
        finishReason: null,
        promptHash,
        errorMessage: "Upstream unavailable",
      });
      if (!res.headersSent) {
        res.status(502).json({ error: "Upstream unavailable" });
      } else {
        res.end();
      }
    }
  }
);
