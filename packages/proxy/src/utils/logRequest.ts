import { getServiceClient } from "./supabase.js";
import { calculateCost } from "./costs.js";

export interface LogRequestInput {
  apiKeyId: string;
  model: string;
  provider: "openai" | "anthropic";
  featureTag: string | null;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  status: "success" | "error" | "timeout";
  finishReason: string | null;
  promptHash: string | null;
  errorMessage: string | null;
}

/**
 * Inserts a row into `requests`. Caller MUST NOT await — this is fire-and-forget
 * to keep proxy latency minimal. Errors are logged to stderr.
 */
export function logRequest(input: LogRequestInput): void {
  const cost = calculateCost(input.model, input.promptTokens, input.completionTokens);
  const total = input.promptTokens + input.completionTokens;

  const supabase = getServiceClient();
  void supabase
    .from("requests")
    .insert({
      api_key_id: input.apiKeyId,
      model: input.model,
      provider: input.provider,
      feature_tag: input.featureTag,
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      total_tokens: total,
      cost_usd: cost,
      latency_ms: input.latencyMs,
      status: input.status,
      finish_reason: input.finishReason,
      prompt_hash: input.promptHash,
      error_message: input.errorMessage,
    })
    .then(({ error }) => {
      if (error) console.error("[logRequest] insert failed:", error.message);
    });
}
