-- Layer 2/3: optimization + governance

alter table requests
  add column if not exists compression_applied boolean not null default false,
  add column if not exists tokens_saved_estimate int not null default 0;

-- Per feature tag policies (scoped to an API key / team)
create table if not exists feature_policies (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references api_keys(id) on delete cascade not null,
  feature_tag text not null,
  monthly_budget_usd numeric(12, 2),
  max_completion_tokens int,
  compress_prompts boolean not null default false,
  fallback_model text,
  rate_limit_per_minute int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (api_key_id, feature_tag)
);

create index if not exists feature_policies_apikey_idx
  on feature_policies (api_key_id);

alter table feature_policies enable row level security;

drop policy if exists "feature_policies_select_own" on feature_policies;
create policy "feature_policies_select_own" on feature_policies
  for select using (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  );

drop policy if exists "feature_policies_insert_own" on feature_policies;
create policy "feature_policies_insert_own" on feature_policies
  for insert with check (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  );

drop policy if exists "feature_policies_update_own" on feature_policies;
create policy "feature_policies_update_own" on feature_policies
  for update using (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  ) with check (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  );

drop policy if exists "feature_policies_delete_own" on feature_policies;
create policy "feature_policies_delete_own" on feature_policies
  for delete using (
    api_key_id in (select id from api_keys where user_id = auth.uid())
  );
