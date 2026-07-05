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
  /** Subset of promptTokens served from a provider prompt cache (read hit). */
  cachedTokens?: number;
  /** Subset of promptTokens that were written into the cache this turn. */
  cacheCreationTokens?: number;
  complexity?: string | null;
  optimizationStrategy?: string | null;
  techniquesApplied?: string[] | null;
  originalPromptTokens?: number;
  optimizedPromptTokens?: number;
  messagesDropped?: number;
  trimTokensSaved?: number;
  structuredOutputCandidate?: boolean;
  batchCandidate?: boolean;
}

/**
 * Inserts a row into `requests`. Caller MUST NOT await — this is fire-and-forget
 * to keep proxy latency minimal. Errors are logged to stderr.
 */
export function logRequest(input: LogRequestInput): void {
  const cached = input.cachedTokens ?? 0;
  const cacheCreation = input.cacheCreationTokens ?? 0;
  const cost = calculateCost(
    input.model,
    input.promptTokens,
    input.completionTokens,
    cached,
    cacheCreation
  );
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
      cachedTokens: cached,
      cacheCreationTokens: cacheCreation,
      complexity: input.complexity ?? null,
      optimizationStrategy: input.optimizationStrategy ?? null,
      techniquesApplied: input.techniquesApplied ?? null,
      originalPromptTokens: input.originalPromptTokens ?? 0,
      optimizedPromptTokens: input.optimizedPromptTokens ?? 0,
      messagesDropped: input.messagesDropped ?? 0,
      trimTokensSaved: input.trimTokensSaved ?? 0,
      structuredOutputCandidate: input.structuredOutputCandidate ?? false,
      batchCandidate: input.batchCandidate ?? false,
    });
  } catch (err) {
    console.error("[logRequest] insert failed:", err);
  }
}
