/**
 * Optional LLM rewrite generation for personalized suggestions.
 *
 * Gated behind ENABLE_PROMPT_REWRITE: unlike retrieval (fully local), this sends
 * prompt text to the configured upstream, so it is opt-in. Best-effort — any
 * failure (flag off, no key, network/parse error) returns null and the caller
 * falls back to retrieval exemplars + rule-based suggestions.
 */

import {
  getOpenAIUpstreamUrl,
  getRewriteApiKey,
  getRewriteModel,
  isPromptRewriteEnabled,
} from "../config.js";
import type { RevisionMatch } from "./retrieval.js";

const SYSTEM_PROMPT =
  "You rewrite prompts to be more token-efficient while preserving the user's intent. " +
  "Match the tightening style shown in the examples (the user's own past edits). " +
  "Reply with ONLY the rewritten prompt — no preamble, no quotes, no explanation.";

const TIMEOUT_MS = 8000;

interface ChatCompletion {
  choices?: { message?: { content?: string } }[];
}

/**
 * Generates a tighter rewrite of `prompt`, using the user's similar past
 * (draft -> accepted) pairs as few-shot exemplars. Returns null when disabled
 * or on any error.
 */
export async function generateRewrite(
  prompt: string,
  exemplars: RevisionMatch[]
): Promise<string | null> {
  if (!isPromptRewriteEnabled()) return null;
  const apiKey = getRewriteApiKey();
  if (!apiKey || !prompt.trim() || exemplars.length === 0) return null;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...exemplars.flatMap((e) => [
      { role: "user", content: e.draft },
      { role: "assistant", content: e.final },
    ]),
    { role: "user", content: prompt },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(getOpenAIUpstreamUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: getRewriteModel(),
        messages,
        temperature: 0.2,
        max_tokens: 400,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ChatCompletion;
    const text = body.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (err) {
    console.error("[personalization/rewrite] generation failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
