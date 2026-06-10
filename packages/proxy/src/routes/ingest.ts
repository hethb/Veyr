import { Router, type Request, type Response } from "express";
import { apiKeyAuth } from "../middleware/auth.js";
import { logRequest } from "../utils/logRequest.js";
import { sha256 } from "../utils/hash.js";

export const ingestRouter: Router = Router();

// ---------------------------------------------------------------------------
// POST /ingest/web-chat
//
// Records a chat that happened on chatgpt.com / claude.ai (the request never
// went through this proxy — it went straight from the browser to the LLM
// provider). The browser extension calls this after each send so the
// dashboard reflects web-chat usage alongside SDK / CLI traffic.
//
// Auth: same as the upstream LLM routes — accepts `x-promptlens-key` or, in
// single-tenant local mode (`PROMPTLENS_ALLOW_ANON=true`), falls back to the
// default API key. The extension can store a key in chrome.storage for hosted
// multi-tenant deployments.
//
// Request body:
//   {
//     site: "chatgpt" | "claude",
//     prompt: string,           // raw text; only its SHA-256 is persisted
//     promptTokens: number,     // client-side estimate
//     completionTokens?: number,
//     model?: string,           // best-guess; defaults per site
//     featureTag?: string       // defaults to "web-chatgpt" / "web-claude"
//   }
// ---------------------------------------------------------------------------

interface WebChatBody {
  site?: string;
  prompt?: string;
  promptTokens?: number;
  completionTokens?: number;
  model?: string;
  featureTag?: string;
}

function normalizeSite(raw: unknown): "chatgpt" | "claude" {
  return String(raw ?? "").toLowerCase().includes("claude") ? "claude" : "chatgpt";
}

function defaultModel(site: "chatgpt" | "claude"): string {
  // Reasonable defaults so cost estimates are sane. The extension may override
  // this if it has higher-confidence detection (e.g. the active model picker).
  return site === "claude" ? "claude-3-5-sonnet-20241022" : "gpt-4o";
}

function defaultTag(site: "chatgpt" | "claude"): string {
  return site === "claude" ? "web-claude" : "web-chatgpt";
}

function nonNegativeInt(n: unknown, fallback = 0): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.round(v);
}

ingestRouter.post(
  "/web-chat",
  apiKeyAuth,
  (req: Request, res: Response): void => {
    const apiKeyId = req.apiKeyId;
    if (!apiKeyId) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }

    const body = (req.body ?? {}) as WebChatBody;
    const site = normalizeSite(body.site);
    const provider = site === "claude" ? "anthropic" : "openai";
    const model = typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : defaultModel(site);
    const featureTag = typeof body.featureTag === "string" && body.featureTag.trim()
      ? body.featureTag.trim()
      : defaultTag(site);

    const promptTokens = nonNegativeInt(body.promptTokens);
    const completionTokens = nonNegativeInt(body.completionTokens);

    // Hash the prompt text (when supplied) so the dashboard's "Top prompt
    // templates" view still works. We never persist the raw text here.
    const promptText = typeof body.prompt === "string" ? body.prompt : "";
    const promptHash = promptText ? sha256(promptText) : null;

    logRequest({
      apiKeyId,
      model,
      provider,
      featureTag,
      promptTokens,
      completionTokens,
      latencyMs: 0,
      status: "success",
      finishReason: null,
      promptHash,
      errorMessage: null,
    });

    res.status(202).json({ ok: true });
  }
);
