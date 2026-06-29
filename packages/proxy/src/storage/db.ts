import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";

let cached: Database.Database | null = null;

/** Resolves the SQLite file path (override with VEYR_DB_PATH). */
function resolveDbPath(): string {
  const fromEnv = process.env.VEYR_DB_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);
  // __dirname is packages/proxy/{src,dist}/storage -> ../../.veyr/data.db
  return resolve(__dirname, "..", "..", ".veyr", "data.db");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS api_keys_prefix_idx ON api_keys (key_prefix);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  feature_tag TEXT,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,
  cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL,
  status TEXT NOT NULL,
  finish_reason TEXT,
  prompt_hash TEXT,
  error_message TEXT,
  compression_applied INTEGER NOT NULL DEFAULT 0,
  tokens_saved_estimate INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS requests_ts_idx ON requests (timestamp DESC);
CREATE INDEX IF NOT EXISTS requests_apikey_idx ON requests (api_key_id);
CREATE INDEX IF NOT EXISTS requests_prompthash_idx ON requests (prompt_hash);

CREATE TABLE IF NOT EXISTS feature_policies (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL,
  feature_tag TEXT NOT NULL,
  monthly_budget_usd REAL,
  max_completion_tokens INTEGER,
  compress_prompts INTEGER NOT NULL DEFAULT 0,
  fallback_model TEXT,
  rate_limit_per_minute INTEGER,
  enable_prompt_caching INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (api_key_id, feature_tag)
);
CREATE INDEX IF NOT EXISTS feature_policies_apikey_idx ON feature_policies (api_key_id);

-- Prompt-personalization learning signal (see docs/prompt-personalization.md).
--
-- suggestion_events: METADATA ONLY, always recorded. The accept/reject label
-- for the rule-based linter plus lightweight structural features. No raw prompt
-- text is ever stored here, so it is safe under the privacy-first default.
CREATE TABLE IF NOT EXISTS suggestion_events (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,        -- user_id (hosted) or 'local' / api_key_id
  subject_kind TEXT NOT NULL,      -- 'user' | 'key' | 'local'
  timestamp TEXT NOT NULL,
  suggestion_id TEXT NOT NULL,     -- e.g. 'be-specific', 'cap-output'
  action TEXT NOT NULL,            -- 'accepted' | 'dismissed'
  surface TEXT NOT NULL,           -- 'dashboard' | 'extension'
  token_estimate INTEGER,
  template_hash TEXT,              -- structure with variables stripped (sha256)
  features_json TEXT               -- JSON of structural flags; no raw text
);
CREATE INDEX IF NOT EXISTS suggestion_events_subject_idx
  ON suggestion_events (subject_id, timestamp DESC);

-- prompt_revisions: RAW (draft -> final) rewrite pairs. Contains prompt text,
-- so rows are written ONLY when STORE_PROMPTS=true. The training signal for the
-- Phase-2 retrieval index; the embedding column is filled later (nullable now).
CREATE TABLE IF NOT EXISTS prompt_revisions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  draft_prompt TEXT NOT NULL,
  final_prompt TEXT NOT NULL,
  accepted_suggestion_ids TEXT,    -- JSON array of suggestion ids
  draft_tokens INTEGER,
  final_tokens INTEGER,
  template_hash TEXT,
  embedding BLOB                   -- Phase 2 fills this via the Embedder seam
);
CREATE INDEX IF NOT EXISTS prompt_revisions_subject_idx
  ON prompt_revisions (subject_id, timestamp DESC);
`;

/**
 * Idempotent column migrations for existing databases. SQLite has no
 * ADD COLUMN IF NOT EXISTS, so we inspect the table first.
 */
function runMigrations(db: Database.Database): void {
  const apiKeyCols = db.prepare("PRAGMA table_info(api_keys)").all() as {
    name: string;
  }[];
  if (!apiKeyCols.some((c) => c.name === "user_id")) {
    db.exec("ALTER TABLE api_keys ADD COLUMN user_id TEXT");
  }
  db.exec("CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id)");

  // Prompt-caching telemetry. We track cache reads and cache creations
  // separately so the dashboard can show genuine cache hit rate and savings.
  const reqCols = db.prepare("PRAGMA table_info(requests)").all() as {
    name: string;
  }[];
  if (!reqCols.some((c) => c.name === "cached_tokens")) {
    db.exec("ALTER TABLE requests ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0");
  }
  if (!reqCols.some((c) => c.name === "cache_creation_tokens")) {
    db.exec(
      "ALTER TABLE requests ADD COLUMN cache_creation_tokens INTEGER NOT NULL DEFAULT 0"
    );
  }

  // Per-feature policy flag for auto-injecting Anthropic cache_control.
  const policyCols = db.prepare("PRAGMA table_info(feature_policies)").all() as {
    name: string;
  }[];
  if (!policyCols.some((c) => c.name === "enable_prompt_caching")) {
    db.exec(
      "ALTER TABLE feature_policies ADD COLUMN enable_prompt_caching INTEGER NOT NULL DEFAULT 0"
    );
  }
}

/** Returns a process-wide SQLite connection, creating the schema on first use. */
export function getDb(): Database.Database {
  if (cached) return cached;
  const path = resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  runMigrations(db);
  cached = db;
  return cached;
}

export { resolveDbPath };
