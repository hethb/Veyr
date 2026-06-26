# Prompt Autocomplete / Personalization — design & phasing

A per-user "prompt autocomplete" layer: learn an individual's prompting style
and suggest tighter, more token-efficient phrasing as they type. It **extends**
the existing stateless rule-based linter (`POST /api/analysis/prompt-lint`,
`optimization/promptLint.ts`) rather than replacing it.

## Decisions locked for this work (from scope Q&A)

| Decision | Choice |
|---|---|
| Privacy default | **Metadata labels by default; raw text gated.** Accept/reject signal + structural features are stored always (no raw text). Raw `(draft, final)` pairs stored **only** when `STORE_PROMPTS=true`. |
| Personalize per | **`user_id` when present, else a stable fallback** (`local` on single-tenant; `api_key_id` on key-authenticated surfaces in Phase 2). |
| Phase-1 capture surface | **Dashboard Prompt Helper only.** Browser-extension ghost-text lands in Phase 2. |
| Embeddings | Python is allowed but must be **privacy-first (data stays local)**. Phase 1 abstracts behind an `Embedder` interface so the backend is a Phase-2 decision. |

## Privacy model

Two tables, two sensitivity tiers:

- `suggestion_events` — **metadata only, always on.** `suggestion_id`,
  `accepted|dismissed`, surface, token estimate, a **template hash** (structure
  with variables/paths/numbers stripped), and a small JSON of boolean/structural
  features. No raw prompt text ever. This is the core ML *label*.
- `prompt_revisions` — **raw `(draft_prompt, final_prompt)` pairs, gated behind
  `STORE_PROMPTS=true`.** This is the training signal for retrieval/generation.
  When `STORE_PROMPTS` is off, nothing is written here; the accept/reject labels
  still flow into `suggestion_events`, so the system keeps learning *structure*
  without ever persisting prose.

Net effect: a privacy-first deployment (the default) still accumulates a useful
accept/reject + structural-feature dataset; only deployments that explicitly opt
in via `STORE_PROMPTS` accumulate raw rewrite pairs.

## Phase 1 — data foundation (this session, no ML)

1. **Schema** (`storage/db.ts`): add `suggestion_events` and `prompt_revisions`
   as `CREATE TABLE IF NOT EXISTS` (safe for new + existing DBs; no ALTERs).
   `prompt_revisions.embedding BLOB` is nullable now — Phase 2 fills it.
2. **Feature extraction** (`personalization/features.ts`): `extractFeatures()`
   → token estimate, repeated n-grams, structural flags (file paths, acceptance
   criteria, vague verbs), and `templateHash()` (variables/paths/numbers/quoted
   strings → placeholders, then SHA-256). Pure, no raw text retained.
3. **Storage logic** (`storage/store.ts`): `recordSuggestionEvent()` (always),
   `recordPromptRevision()` (no-op unless `STORE_PROMPTS`), and
   `getRecentRevisions()` (Phase-2 retrieval read path, added now).
4. **Endpoints** (`routes/analysis.ts`):
   - `POST /api/analysis/suggestion-event` — record accept/dismiss (+ derived
     features). Metadata only.
   - `POST /api/analysis/prompt-revision` — record a `(draft, final)` pair;
     persists raw text only under `STORE_PROMPTS`. Returns `{ stored }`.
   - `POST /api/analysis/personalized-suggest` — **the stub.** Same response
     shape as `prompt-lint` plus `personalized`, `source`, `exemplars`,
     `rewrite`. Today it returns the rule-based lint with
     `personalized:false, source:"rules"`. Phase 2 fills the rest **without an
     API-shape change**.
5. **Dashboard** (`pages/PromptHelper.tsx`, `lib/api.ts`): Accept/Dismiss on
   each suggestion → `suggestion-event`; copying the improved template records a
   `prompt-revision` (`draft` = typed prompt, `final` = template). Switch the
   page to call `personalized-suggest` so Phase 2 upgrades the UI for free.

### Phase-2 seam (built now, inert)

`personalization/embedder.ts` defines:
```ts
export interface Embedder { embed(texts: string[]): Promise<Float32Array[]>; }
```
plus a `NoopEmbedder` default. `personalization/suggest.ts` exposes
`personalizedSuggest(subjectId, prompt)`, today rules-only. Phase 2 swaps the
embedder and adds retrieval inside `suggest.ts` — the route and the dashboard
never change.

## Phase 2 — personalization via retrieval (no trained model)

Per-user retrieval index over the user's own accepted rewrites:
embed `prompt_revisions.final_prompt`; on new input, retrieve top-k similar past
`(draft → accepted-final)` and use them as **few-shot exemplars** for an LLM
rewrite. Works from day one with sparse data. Surfaces: ghost-text in the
browser extension; suggestion panel in Prompt Helper. Cold start: fall back to
rules-only (exactly today's behavior) until the user has ≥N revisions.

## Phase 3 — real ML (≥ ~500 labeled examples)

- **(a) Ranker** — score candidate rewrites against accept/reject history.
  Fast, cheap, no generation. Best first ROI; trains on `suggestion_events`
  which exist from day one. Can run in JS (logistic regression / gradient
  boosting via a small lib) — **no new infra**.
- **(b) Fine-tune a small open-weight model** on aggregated
  `verbose → accepted-compression` pairs, with per-user steering via a short
  "style profile" prefix (one model, not one-per-user). Needs raw pairs
  (`STORE_PROMPTS`) and a **Python training/serving microservice**.
- **(c) Cold start** — bootstrap new users from cross-user aggregates +
  population priors; blend toward personal data as their history grows.

**Recommendation / build order:** (a) ranker first — cheap, JS-only, uses the
day-one label stream. Then Phase-2 retrieval with a **local** embedding model
(Python `sentence-transformers`/`fastembed` microservice on the proxy host, or
JS `transformers.js` to stay single-process) so prompt text never leaves the
box. Defer (b) fine-tuning until raw-pair volume and measured lift justify the
training/serving infra. New infra is introduced only at (b); (a) and the
retrieval store fit the current Node/TS proxy + SQLite.
