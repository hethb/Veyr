import { insertRequest } from "../storage/store.js";
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
  compressionApplied?: boolean;
  tokensSavedEstimate?: number;
}

/**
 * Inserts a row into `requests`. Caller MUST NOT await — this is fire-and-forget
 * to keep proxy latency minimal. Errors are logged to stderr.
 */
export function logRequest(input: LogRequestInput): void {
  const cost = calculateCost(input.model, input.promptTokens, input.completionTokens);
  const total = input.promptTokens + input.completionTokens;

  try {
    insertRequest({
      apiKeyId: input.apiKeyId,
      model: input.model,
      provider: input.provider,
      featureTag: input.featureTag,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: total,
      costUsd: cost,
      latencyMs: input.latencyMs,
      status: input.status,
      finishReason: input.finishReason,
      promptHash: input.promptHash,
      errorMessage: input.errorMessage,
      compressionApplied: input.compressionApplied ?? false,
      tokensSavedEstimate: input.tokensSavedEstimate ?? 0,
    });
  } catch (err) {
    console.error("[logRequest] insert failed:", err);
  }
}
