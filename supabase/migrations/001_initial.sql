-- PromptLens initial schema
-- Tables: api_keys, requests
-- RLS: users can only see/manage their own data

create extension if not exists "pgcrypto";

-- =====================================================================
-- api_keys
-- =====================================================================
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  key_hash text not null unique,       -- bcrypt hash, never plaintext
  key_prefix text not null,            -- first 12 chars for display, e.g. "pl_live_a1b2"
  name text not null default 'Default',
  created_at timestamptz default now(),
  last_used_at timestamptz
);

create index if not exists api_keys_user_id_idx on api_keys (user_id);

-- =====================================================================
-- requests
-- =====================================================================
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references api_keys(id) on delete cascade not null,
  timestamp timestamptz default now() not null,
  model text not null,
  provider text not null,                  -- "openai" | "anthropic"
  feature_tag text,
  prompt_tokens int not null,
  completion_tokens int not null,
  total_tokens int not null,
  cost_usd numeric(10, 8) not null,
  latency_ms int not null,
  status text not null,                    -- "success" | "error" | "timeout"
  finish_reason text,                      -- "stop" | "length" | "content_filter"
  prompt_hash text,                        -- sha256 of system prompt
  error_message text
);

create index if not exists requests_apikey_ts_idx     on requests (api_key_id, timestamp desc);
create index if not exists requests_apikey_tag_idx    on requests (api_key_id, feature_tag);
create index if not exists requests_prompthash_idx    on requests (prompt_hash);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table api_keys enable row level security;
alter table requests enable row level security;

-- api_keys: owner-only access via auth.uid()
drop policy if exists "api_keys_select_own" on api_keys;
create policy "api_keys_select_own" on api_keys
  for select using (user_id = auth.uid());

drop policy if exists "api_keys_insert_own" on api_keys;
create policy "api_keys_insert_own" on api_keys
  for insert with check (user_id = auth.uid());

drop policy if exists "api_keys_update_own" on api_keys;
create policy "api_keys_update_own" on api_keys
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "api_keys_delete_own" on api_keys;
create policy "api_keys_delete_own" on api_keys
  for delete using (user_id = auth.uid());

-- requests: owner sees rows for their own api_keys
drop policy if exists "requests_select_own" on requests;
create policy "requests_select_own" on requests
  for select using (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  );

drop policy if exists "requests_insert_own" on requests;
create policy "requests_insert_own" on requests
  for insert with check (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  );

drop policy if exists "requests_update_own" on requests;
create policy "requests_update_own" on requests
  for update using (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  ) with check (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  );

drop policy if exists "requests_delete_own" on requests;
create policy "requests_delete_own" on requests
  for delete using (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  );

-- Note: the proxy uses the service-role key, which bypasses RLS for inserts.
-- All dashboard reads go through Supabase using the user's JWT and are scoped by these policies.
