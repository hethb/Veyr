import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";
import { isRawPromptStorageEnabled } from "../config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ApiKeyRow {
  id: string;
  key_prefix: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export interface RequestInsert {
  apiKeyId: string;
  model: string;
  provider: string;
  featureTag: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  status: string;
  finishReason: string | null;
  promptHash: string | null;
  errorMessage: string | null;
  compressionApplied: boolean;
  tokensSavedEstimate: number;
  /** Subset of promptTokens served from a provider prompt cache (read hit). */
  cachedTokens?: number;
  /** Subset of promptTokens that were written into the cache this turn. */
  cacheCreationTokens?: number;
  /** Optional explicit timestamp (ISO). Defaults to now. Used by the seeder. */
  timestamp?: string;
  complexity?: string | null;
  optimizationStrategy?: string | null;
  /** JSON array of technique names applied by the optimizer. */
  techniquesApplied?: string[] | null;
  originalPromptTokens?: number;
  optimizedPromptTokens?: number;
}

export interface RequestRow {
  timestamp: string;
  cost_usd: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  cache_creation_tokens: number;
  feature_tag: string | null;
  prompt_hash: string | null;
}

export interface FeaturePolicy {
  id: string;
  api_key_id: string;
  feature_tag: string;
  monthly_budget_usd: number | null;
  max_completion_tokens: number | null;
  compress_prompts: boolean;
  fallback_model: string | null;
  rate_limit_per_minute: number | null;
  enable_prompt_caching: boolean;
}

export interface PolicyUpsert {
  apiKeyId: string;
  featureTag: string;
  monthlyBudgetUsd: number | null;
  maxCompletionTokens: number | null;
  compressPrompts: boolean;
  fallbackModel: string | null;
  rateLimitPerMinute: number | null;
  enablePromptCaching: boolean;
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------
export function findApiKeysByPrefix(
  prefix: string
): { id: string; key_hash: string }[] {
  return getDb()
    .prepare("SELECT id, key_hash FROM api_keys WHERE key_prefix = ?")
    .all(prefix) as { id: string; key_hash: string }[];
}

/**
 * Fixed owner for anonymous local traffic (e.g. Claude Code) when
 * `VEYR_ALLOW_ANON=true`. The row is created on first use; its
 * key_hash ("!") can never match a bcrypt comparison, so the id exists for
 * attribution only and is not a usable credential.
 */
export const ANON_API_KEY_ID = "00000000-0000-0000-0000-000000000002";

export function ensureAnonApiKey(): string {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO api_keys (id, key_hash, key_prefix, name, created_at)
       VALUES (?, '!', 'anon', 'Anonymous (local tools)', ?)`
    )
    .run(ANON_API_KEY_ID, new Date().toISOString());
  return ANON_API_KEY_ID;
}

export function touchKeyLastUsed(id: string): void {
  getDb()
    .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
    .run(new Date().toISOString(), id);
}

export function createApiKey(input: {
  name: string;
  hash: string;
  prefix: string;
  id?: string;
  userId?: string | null;
}): ApiKeyRow {
  const id = input.id ?? randomUUID();
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO api_keys (id, key_hash, key_prefix, name, created_at, last_used_at, user_id)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`
    )
    .run(id, input.hash, input.prefix, input.name, createdAt, input.userId ?? null);
  return {
    id,
    key_prefix: input.prefix,
    name: input.name,
    created_at: createdAt,
    last_used_at: null,
  };
}

/** Lists keys. When `userId` is provided, only that user's keys are returned. */
export function listApiKeys(userId?: string | null): ApiKeyRow[] {
  const db = getDb();
  if (userId) {
    return db
      .prepare(
        `SELECT id, key_prefix, name, created_at, last_used_at
         FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`
      )
      .all(userId) as ApiKeyRow[];
  }
  return db
    .prepare(
      `SELECT id, key_prefix, name, created_at, last_used_at
       FROM api_keys ORDER BY created_at DESC`
    )
    .all() as ApiKeyRow[];
}

/** Deletes a key. When `userId` is provided, only deletes if the user owns it. */
export function deleteApiKey(id: string, userId?: string | null): boolean {
  const db = getDb();
  const info = userId
    ? db.prepare("DELETE FROM api_keys WHERE id = ? AND user_id = ?").run(id, userId)
    : db.prepare("DELETE FROM api_keys WHERE id = ?").run(id);
  return info.changes > 0;
}

/** True if the given api key is owned by the user (used for authz checks). */
export function apiKeyBelongsToUser(apiKeyId: string, userId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 AS ok FROM api_keys WHERE id = ? AND user_id = ?")
    .get(apiKeyId, userId) as { ok: number } | undefined;
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
export function insertRequest(input: RequestInsert): void {
  getDb()
    .prepare(
      `INSERT INTO requests (
         id, api_key_id, timestamp, model, provider, feature_tag,
         prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms,
         status, finish_reason, prompt_hash, error_message,
         compression_applied, tokens_saved_estimate,
         cached_tokens, cache_creation_tokens,
         complexity, optimization_strategy, techniques_applied,
         original_prompt_tokens, optimized_prompt_tokens
       ) VALUES (
         @id, @api_key_id, @timestamp, @model, @provider, @feature_tag,
         @prompt_tokens, @completion_tokens, @total_tokens, @cost_usd, @latency_ms,
         @status, @finish_reason, @prompt_hash, @error_message,
         @compression_applied, @tokens_saved_estimate,
         @cached_tokens, @cache_creation_tokens,
         @complexity, @optimization_strategy, @techniques_applied,
         @original_prompt_tokens, @optimized_prompt_tokens
       )`
    )
    .run({
      id: randomUUID(),
      api_key_id: input.apiKeyId,
      timestamp: input.timestamp ?? new Date().toISOString(),
      model: input.model,
      provider: input.provider,
      feature_tag: input.featureTag,
      prompt_tokens: input.promptTokens,
      completion_tokens: input.completionTokens,
      total_tokens: input.totalTokens,
      cost_usd: input.costUsd,
      latency_ms: input.latencyMs,
      status: input.status,
      finish_reason: input.finishReason,
      prompt_hash: input.promptHash,
      error_message: input.errorMessage,
      compression_applied: input.compressionApplied ? 1 : 0,
      tokens_saved_estimate: input.tokensSavedEstimate,
      cached_tokens: input.cachedTokens ?? 0,
      cache_creation_tokens: input.cacheCreationTokens ?? 0,
      complexity: input.complexity ?? null,
      optimization_strategy: input.optimizationStrategy ?? null,
      techniques_applied: input.techniquesApplied?.length
        ? JSON.stringify(input.techniquesApplied)
        : null,
      original_prompt_tokens: input.originalPromptTokens ?? 0,
      optimized_prompt_tokens: input.optimizedPromptTokens ?? 0,
    });
}

/** Richer row shape for the optimization analysis engine. */
export interface AnalysisRow {
  timestamp: string;
  model: string;
  feature_tag: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  status: string;
  prompt_hash: string | null;
  cached_tokens: number;
  cache_creation_tokens: number;
}

/**
 * Rows for the optimization analysis engine. Selects the extra columns
 * (model, status) the stats endpoints don't need. When `userId` is provided,
 * only that user's requests (via owned api keys) are returned.
 */
export function getRequestsForAnalysis(
  sinceIso: string,
  userId?: string | null
): AnalysisRow[] {
  const db = getDb();
  if (userId) {
    return db
      .prepare(
        `SELECT timestamp, model, feature_tag, prompt_tokens, completion_tokens,
                total_tokens, cost_usd, status, prompt_hash,
                cached_tokens, cache_creation_tokens
         FROM requests
         WHERE timestamp >= ?
           AND api_key_id IN (SELECT id FROM api_keys WHERE user_id = ?)
         ORDER BY timestamp ASC
         LIMIT 100000`
      )
      .all(sinceIso, userId) as AnalysisRow[];
  }
  return db
    .prepare(
      `SELECT timestamp, model, feature_tag, prompt_tokens, completion_tokens,
              total_tokens, cost_usd, status, prompt_hash,
              cached_tokens, cache_creation_tokens
       FROM requests
       WHERE timestamp >= ?
       ORDER BY timestamp ASC
       LIMIT 100000`
    )
    .all(sinceIso) as AnalysisRow[];
}

/**
 * All request rows since an ISO timestamp. When `userId` is provided, only that
 * user's requests (via owned api keys) are returned.
 */
export function getRequestsSince(
  sinceIso: string,
  userId?: string | null
): RequestRow[] {
  const db = getDb();
  if (userId) {
    return db
      .prepare(
        `SELECT timestamp, cost_usd, total_tokens, prompt_tokens,
                completion_tokens, cached_tokens, cache_creation_tokens,
                feature_tag, prompt_hash
         FROM requests
         WHERE timestamp >= ?
           AND api_key_id IN (SELECT id FROM api_keys WHERE user_id = ?)
         ORDER BY timestamp DESC
         LIMIT 50000`
      )
      .all(sinceIso, userId) as RequestRow[];
  }
  return db
    .prepare(
      `SELECT timestamp, cost_usd, total_tokens, prompt_tokens,
              completion_tokens, cached_tokens, cache_creation_tokens,
              feature_tag, prompt_hash
       FROM requests
       WHERE timestamp >= ?
       ORDER BY timestamp DESC
       LIMIT 50000`
    )
    .all(sinceIso) as RequestRow[];
}

/**
 * Request rows since an ISO timestamp, scoped to a single api key. Used by the
 * key-authenticated stats routes (e.g. the browser extension, which holds a
 * `pl_live_…` key rather than a dashboard session).
 */
export function getRequestsSinceForKey(
  sinceIso: string,
  apiKeyId: string
): RequestRow[] {
  return getDb()
    .prepare(
      `SELECT timestamp, cost_usd, total_tokens, prompt_tokens,
              completion_tokens, cached_tokens, cache_creation_tokens,
              feature_tag, prompt_hash
       FROM requests
       WHERE timestamp >= ? AND api_key_id = ?
       ORDER BY timestamp DESC
       LIMIT 50000`
    )
    .all(sinceIso, apiKeyId) as RequestRow[];
}

export interface RecentRequestRow {
  id: string;
  timestamp: string;
  model: string;
  feature_tag: string | null;
  total_tokens: number;
  cost_usd: number;
}

/** Most recent requests, newest first — backs `GET /api/stats/recent`. */
export function getRecentRequests(opts: {
  limit: number;
  tag?: string | null;
  userId?: string | null;
  apiKeyId?: string | null;
}): RecentRequestRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.tag) {
    where.push("feature_tag = ?");
    params.push(opts.tag);
  }
  if (opts.apiKeyId) {
    where.push("api_key_id = ?");
    params.push(opts.apiKeyId);
  } else if (opts.userId) {
    where.push("api_key_id IN (SELECT id FROM api_keys WHERE user_id = ?)");
    params.push(opts.userId);
  }
  const sql = `SELECT id, timestamp, model, feature_tag, total_tokens, cost_usd
       FROM requests
       ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY timestamp DESC
       LIMIT ?`;
  return getDb().prepare(sql).all(...params, opts.limit) as RecentRequestRow[];
}

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------
export function getMonthlyFeatureSpend(
  apiKeyId: string,
  featureTag: string
): number {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(cost_usd), 0) AS total
       FROM requests
       WHERE api_key_id = ? AND feature_tag = ? AND timestamp >= ?`
    )
    .get(apiKeyId, featureTag, start.toISOString()) as { total: number };
  return row?.total ?? 0;
}

function rowToPolicy(row: Record<string, unknown> | undefined): FeaturePolicy | null {
  if (!row) return null;
  return {
    id: row.id as string,
    api_key_id: row.api_key_id as string,
    feature_tag: row.feature_tag as string,
    monthly_budget_usd: (row.monthly_budget_usd as number | null) ?? null,
    max_completion_tokens: (row.max_completion_tokens as number | null) ?? null,
    compress_prompts: Boolean(row.compress_prompts),
    fallback_model: (row.fallback_model as string | null) ?? null,
    rate_limit_per_minute: (row.rate_limit_per_minute as number | null) ?? null,
    enable_prompt_caching: Boolean(row.enable_prompt_caching),
  };
}

export function getFeaturePolicy(
  apiKeyId: string,
  featureTag: string
): FeaturePolicy | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM feature_policies WHERE api_key_id = ? AND feature_tag = ?`
    )
    .get(apiKeyId, featureTag) as Record<string, unknown> | undefined;
  return rowToPolicy(row);
}

export function listPolicies(apiKeyId: string): FeaturePolicy[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM feature_policies WHERE api_key_id = ? ORDER BY feature_tag`
    )
    .all(apiKeyId) as Record<string, unknown>[];
  return rows.map((r) => rowToPolicy(r)!).filter(Boolean);
}

export function upsertPolicy(input: PolicyUpsert): FeaturePolicy {
  const now = new Date().toISOString();
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM feature_policies WHERE api_key_id = ? AND feature_tag = ?`
    )
    .get(input.apiKeyId, input.featureTag) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  db.prepare(
    `INSERT INTO feature_policies (
       id, api_key_id, feature_tag, monthly_budget_usd, max_completion_tokens,
       compress_prompts, fallback_model, rate_limit_per_minute,
       enable_prompt_caching, created_at, updated_at
     ) VALUES (
       @id, @api_key_id, @feature_tag, @monthly_budget_usd, @max_completion_tokens,
       @compress_prompts, @fallback_model, @rate_limit_per_minute,
       @enable_prompt_caching, @created_at, @updated_at
     )
     ON CONFLICT (api_key_id, feature_tag) DO UPDATE SET
       monthly_budget_usd = excluded.monthly_budget_usd,
       max_completion_tokens = excluded.max_completion_tokens,
       compress_prompts = excluded.compress_prompts,
       fallback_model = excluded.fallback_model,
       rate_limit_per_minute = excluded.rate_limit_per_minute,
       enable_prompt_caching = excluded.enable_prompt_caching,
       updated_at = excluded.updated_at`
  ).run({
    id,
    api_key_id: input.apiKeyId,
    feature_tag: input.featureTag,
    monthly_budget_usd: input.monthlyBudgetUsd,
    max_completion_tokens: input.maxCompletionTokens,
    compress_prompts: input.compressPrompts ? 1 : 0,
    fallback_model: input.fallbackModel,
    rate_limit_per_minute: input.rateLimitPerMinute,
    enable_prompt_caching: input.enablePromptCaching ? 1 : 0,
    created_at: now,
    updated_at: now,
  });
  return getFeaturePolicy(input.apiKeyId, input.featureTag)!;
}

// ---------------------------------------------------------------------------
// Prompt personalization (see docs/prompt-personalization.md)
// ---------------------------------------------------------------------------
export type SubjectKind = "user" | "key" | "local";

export interface SuggestionEventInsert {
  subjectId: string;
  subjectKind: SubjectKind;
  suggestionId: string;
  action: "accepted" | "dismissed";
  surface: string;
  tokenEstimate?: number | null;
  templateHash?: string | null;
  /** Pre-serialized JSON of structural features. No raw prompt text. */
  featuresJson?: string | null;
}

/**
 * Records an accept/dismiss event for a linter suggestion. Metadata only (no raw
 * prompt text), so this is always safe to call regardless of STORE_PROMPTS.
 */
export function recordSuggestionEvent(input: SuggestionEventInsert): void {
  getDb()
    .prepare(
      `INSERT INTO suggestion_events (
         id, subject_id, subject_kind, timestamp, suggestion_id, action,
         surface, token_estimate, template_hash, features_json
       ) VALUES (
         @id, @subject_id, @subject_kind, @timestamp, @suggestion_id, @action,
         @surface, @token_estimate, @template_hash, @features_json
       )`
    )
    .run({
      id: randomUUID(),
      subject_id: input.subjectId,
      subject_kind: input.subjectKind,
      timestamp: new Date().toISOString(),
      suggestion_id: input.suggestionId,
      action: input.action,
      surface: input.surface,
      token_estimate: input.tokenEstimate ?? null,
      template_hash: input.templateHash ?? null,
      features_json: input.featuresJson ?? null,
    });
}

export interface PromptRevisionInsert {
  subjectId: string;
  subjectKind: SubjectKind;
  draftPrompt: string;
  finalPrompt: string;
  acceptedSuggestionIds: string[];
  draftTokens?: number | null;
  finalTokens?: number | null;
  templateHash?: string | null;
}

/**
 * Records a raw (draft -> final) rewrite pair. Because this persists prompt
 * TEXT, it is a no-op unless STORE_PROMPTS=true (privacy-first default).
 * Returns whether the row was actually written.
 */
export function recordPromptRevision(input: PromptRevisionInsert): boolean {
  if (!isRawPromptStorageEnabled()) return false;
  getDb()
    .prepare(
      `INSERT INTO prompt_revisions (
         id, subject_id, subject_kind, timestamp, draft_prompt, final_prompt,
         accepted_suggestion_ids, draft_tokens, final_tokens, template_hash,
         embedding
       ) VALUES (
         @id, @subject_id, @subject_kind, @timestamp, @draft_prompt, @final_prompt,
         @accepted_suggestion_ids, @draft_tokens, @final_tokens, @template_hash,
         NULL
       )`
    )
    .run({
      id: randomUUID(),
      subject_id: input.subjectId,
      subject_kind: input.subjectKind,
      timestamp: new Date().toISOString(),
      draft_prompt: input.draftPrompt,
      final_prompt: input.finalPrompt,
      accepted_suggestion_ids: JSON.stringify(input.acceptedSuggestionIds ?? []),
      draft_tokens: input.draftTokens ?? null,
      final_tokens: input.finalTokens ?? null,
      template_hash: input.templateHash ?? null,
    });
  return true;
}

export interface RevisionRow {
  id: string;
  timestamp: string;
  draft_prompt: string;
  final_prompt: string;
  accepted_suggestion_ids: string | null;
  template_hash: string | null;
}

/**
 * A subject's most recent raw rewrite pairs, newest first. The Phase-2
 * retrieval read path; empty unless STORE_PROMPTS has been collecting rows.
 */
export function getRecentRevisions(subjectId: string, limit = 200): RevisionRow[] {
  return getDb()
    .prepare(
      `SELECT id, timestamp, draft_prompt, final_prompt,
              accepted_suggestion_ids, template_hash
       FROM prompt_revisions
       WHERE subject_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`
    )
    .all(subjectId, limit) as RevisionRow[];
}

export function getPolicyById(
  id: string
): { id: string; api_key_id: string; feature_tag: string } | null {
  const row = getDb()
    .prepare("SELECT id, api_key_id, feature_tag FROM feature_policies WHERE id = ?")
    .get(id) as { id: string; api_key_id: string; feature_tag: string } | undefined;
  return row ?? null;
}

export function deletePolicyById(id: string): boolean {
  const info = getDb().prepare("DELETE FROM feature_policies WHERE id = ?").run(id);
  return info.changes > 0;
}
