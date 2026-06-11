# PromptLens

**LLM spend management** — a hosted proxy between your app and OpenAI/Anthropic.

Change where requests go. PromptLens logs every call (metadata only by default), shows which **feature** is costing you money, compresses bloated prompts, and enforces budgets — from the same integration point.

> Helicone shows what happened. **PromptLens changes what happens.**

See [ROADMAP.md](./ROADMAP.md) for the three product layers (observe → optimize → enforce).

```
your app  ──▶  PromptLens proxy  ──▶  OpenAI / Anthropic
                     │
                     ▼
              local SQLite store
                     │
                     ▼
              PromptLens dashboard
```

> Runs zero-config: the proxy stores keys and request logs in a local SQLite
> file. No external database or login required. (See [Local development](#local-development).)

## Quickstart (plug-in for your app)

Same idea as [TokenGuard](https://github.com/hethb/TokenGuard) — minimal setup — but for **production LLM APIs** (not the browser). Customers add one env var and two lines of code. See [QUICKSTART.md](./QUICKSTART.md) for the full sellable flow vs self-host.

**1. Get a key** — Open the dashboard → **API Keys** → copy `pl_live_…` → set `PROMPTLENS_KEY`. (Or run `npm run seed` to mint one from the CLI.)

**2. Install and wire the SDK**

```bash
npm install promptlens openai
```

```ts
import OpenAI from "openai";
import { promptlensOpenAI } from "promptlens";

const openai = new OpenAI(
  promptlensOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    feature: "my-feature", // optional — shows in dashboard
  })
);
```

**3. Ship** — Existing `chat.completions` calls unchanged. Open the dashboard for cost by feature, tokens, and top prompt templates.

### Control plane (Layers 2 & 3)

Per-request headers (or SDK flags):

- `x-promptlens-compress: 1` — rule-based prompt compression (TokenGuard-style)
- `x-promptlens-cache: 1` — provider prompt caching (see [Prompt caching](#prompt-caching))
- `x-promptlens-max-tokens: 512` — cap completion tokens on outbound requests

Per-feature policies (dashboard API `PUT /api/policies`):

- `monthly_budget_usd` — returns `429` when feature spend exceeds cap
- `compress_prompts` — always compress for that feature
- `enable_prompt_caching` — auto-inject Anthropic `cache_control` on long prompts
- `max_completion_tokens` — enforced server-side

For local development or enterprise self-host, see [Local development](#local-development) below.

## Token optimization

PromptLens analyzes your logged traffic and surfaces specific, actionable ways
to cut token spend. Suggestions appear in a panel on the dashboard and are
served by `GET /api/analysis/suggestions` — all analysis runs **in-process over
the local SQLite data**, with no external API or LLM calls.

Each suggestion includes an estimated monthly saving, the evidence that
triggered it, and a concrete action. The single highest-impact suggestion is
flagged as a **quick win**.

### Detection rules (in plain English)

1. **Expensive model on a simple feature** — a feature averages under 500 prompt
   tokens but mostly uses a frontier model (GPT-4o, Claude Sonnet/Opus) and
   costs more than $5/month. Route it to a mini/Haiku model (~80% cheaper).
2. **Ballooning completion tokens** — a feature's responses are more than 2x
   the length of its inputs (20+ calls, >$3/month). Cap `max_tokens`.
3. **High error rate burning tokens** — more than 10% of a feature's calls (10+
   in the last 7 days) are failing while you still pay for prompt tokens. Fix
   the underlying error.
4. **One feature dominating spend** — a single feature is more than 60% of total
   spend. A risk alert to add a budget cap or model override.
5. **Redundant long prompt template** — the same system prompt hash is sent 50+
   times/month averaging over 800 tokens. Compress it (~30% saving).
6. **Low cache hit rate on cache-eligible traffic** — a feature averages ≥1024
   prompt tokens across 20+ calls and >$2/month, but less than 20% of its
   input bytes are served from cache. Enable provider prompt caching (see
   [Prompt caching](#prompt-caching)). For older traffic with no cache
   instrumentation yet, the rule falls back to detecting repeated bursts (20+
   calls within 10 minutes, 3+ times in 7 days).
7. **Quick win** — whichever live suggestion has the highest estimated saving is
   highlighted so you know where to start.

A suggestion is only surfaced when the evidence clears its threshold — no false
positives. Suggestions are most meaningful after **at least 7 days of traffic**;
with little data the panel simply says there's nothing to suggest yet.

### Pre-send prompt suggestions

PromptLens also helps *before* a call is made. A rule-based prompt linter
(`POST /api/analysis/prompt-lint`, stateless) flags common token wasters and
suggests tighter phrasing, based on community best practices for agents like
Claude Code:

- Drop vague openers ("fix the bug") — name the symptom, file, and function
- Name the exact file(s) instead of a vague target ("fix auth in `src/auth.ts`")
- Don't ask the agent to scan the whole repo — point at specific functions
- Cap the output length/format ("in 3 bullets", "under 150 words", "code only")
- State what "done" looks like (acceptance criteria)
- Split large multi-task prompts into smaller ones; get a plan first
- Cut politeness/hedging filler — be direct
- Start a fresh chat for unrelated tasks (the whole history re-sends each turn)
- Use a cheaper model (Sonnet/Haiku) for simple tasks
- Move repeated rules to `CLAUDE.md` / Custom Instructions

It's surfaced in two places: the **Prompt Helper** page in the dashboard/desktop
app (paste a prompt, get suggestions + a tighter template before sending to your
CLI agent), and live in the **browser extension** overlay on chatgpt.com /
claude.ai as you type.

## Prompt caching

Provider prompt caching reuses the model's intermediate processing of a static
prompt prefix across calls, dropping input cost by **up to 90%** and cutting
latency. PromptLens treats it as a first-class control: we detect when your
prompts are cache-eligible, auto-inject `cache_control` for Anthropic, and
track cache hit rate alongside spend.

**How it works.** Both providers cache the *prefix* of your prompt — the part
that's bit-identical across requests. The first call writes the cache (a small
premium); subsequent calls within the TTL read from it (Anthropic ≈ 10% of
input price, OpenAI ≈ 50%). Anything that changes — a timestamp, the user's
question, a random nonce — invalidates everything after it.

### Opt in

Per-request:

```bash
curl … -H "x-promptlens-cache: 1" …
```

Or in the SDK:

```ts
const openai = new OpenAI(
  promptlensOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    feature: "policy-qa",
    enablePromptCaching: true, // 90% cheaper input on warm cache
  })
);
```

Or per-feature on the dashboard / `PUT /api/policies`:

```json
{ "api_key_id": "…", "feature_tag": "policy-qa", "enable_prompt_caching": true }
```

When enabled on Anthropic, PromptLens wraps your `system` prompt as a single
text block with `cache_control: { type: "ephemeral" }` — **only** when it's at
least 1024 tokens (Anthropic's cache minimum). Below that it's a no-op.

OpenAI prompt caching is automatic above ~1024 tokens of stable prefix — the
flag is still useful because it opts your feature into the dashboard's cache
telemetry headers (`x-promptlens-cache: applied`).

### What gets tracked

Every request now logs:

- `cached_tokens` — input tokens served from a cache HIT this call
- `cache_creation_tokens` — input tokens WRITTEN to the cache this call

Cost is computed accordingly: regular input at list price, cached reads
discounted, cache writes at the small write premium.

### Pre-send cache-friendliness linting

The Prompt Helper page and `POST /api/analysis/prompt-lint` flag the four
patterns most likely to leave caching savings on the table:

- **Live timestamp in the static prompt** — invalidates the cache every minute
- **Dynamic content placed before static instructions** — cache hits are
  sequential; the first change wipes everything after
- **Static and dynamic interleaved** with `{{placeholders}}` — move them to
  the tail so the prefix stays bit-identical
- **Just below the 1024-token Anthropic cache minimum** — a touch more
  reference material unlocks the discount

### Optimization rule

The dashboard surfaces a `caching` suggestion when a feature averages ≥1024
prompt tokens across ≥20 calls but shows <20% cache reads. The fix is one
header flip.

## Document → Markdown

PromptLens ships a built-in document converter that turns PDFs, Word docs,
HTML pages, CSV/TSV, JSON, and XML into compact, LLM-friendly Markdown —
typically **70–90% fewer input tokens** than feeding the raw file (or naïve
text extraction) to a model.

Inspired by Microsoft's [MarkItDown](https://github.com/microsoft/markitdown)
(MIT-licensed). PromptLens does **not** bundle MarkItDown — the conversion
code is a clean-room TypeScript reimplementation so it runs inside the
existing proxy process with no Python runtime. See
[ATTRIBUTIONS.md](./ATTRIBUTIONS.md) for full credit.

### Supported formats

| Source | Notes |
|---|---|
| PDF | via `pdf-parse`; page boundaries become `<!-- page N -->` markers |
| DOCX | via `mammoth` → HTML → Markdown; images dropped |
| HTML | headings, lists, links, tables, code, images; `<script>`/`<style>` stripped |
| CSV / TSV | RFC 4180 quoting; emitted as a Markdown table |
| JSON | flat object arrays → table; everything else → fenced code block |
| XML / SVG | markup stripped, entities decoded |
| Markdown / text | normalised passthrough |

PPTX, XLSX, EPUB, audio/video, and OCR are **not** supported — use the
original MarkItDown for those.

### Use it from the dashboard

Open **Documents** in the sidebar, drop a file. PromptLens shows:

- Converted Markdown with a copy button
- Before/after token counts and percentage saved
- Estimated USD saved per call across GPT-4o, GPT-4o-mini, and Claude 3.5 Sonnet
- A cache-friendly system prompt scaffold (static doc up top, dynamic
  question last — primed for prompt caching)

### Use it from the API

```bash
curl -X POST http://localhost:3001/api/convert \
  -H "Content-Type: application/json" \
  -d "{\"filename\":\"report.pdf\",\"data_b64\":\"$(base64 -i report.pdf)\"}"
```

Returns the converted Markdown plus `original_tokens`, `markdown_tokens`,
`tokens_saved`, `savings_pct`, and `cost_saved_per_call_usd` per model.

Files never leave the proxy. By default the proxy stores nothing about
conversions — they're stateless.

### Prompt compression previews

For redundant-template suggestions, a **Preview compression** button calls
`POST /api/analysis/compress`. By default PromptLens stores only the SHA-256
hash of prompts (not their content), so this returns a `404` explaining that
you must set `STORE_PROMPTS=true` to enable previews. When prompt content is
available, it runs a deterministic, rule-based compression (collapse blank
lines, strip XML/HTML comments, trim "You are an AI assistant…" boilerplate and
filler words) and returns the original vs. compressed token counts.

## Authentication (optional)

PromptLens runs **no-login, single-tenant** by default. For a hosted,
multi-tenant deployment you can turn on **passwordless magic-link auth**
(Supabase) — fully gated behind a flag, so local dev is unaffected.

### The onboarding flow

1. A visitor enters their email on the landing page and hits **Get started**
   (one field, one button — no password, no credit card).
2. Supabase emails them a magic link.
3. Clicking it lands them on `/welcome`, which **auto-generates their first API
   key** and shows it with a copy button and a 2-line integration snippet.
4. They paste the key into their code. Their dashboard populates on the first
   API call.

### Enabling it

Set these on the **proxy** (so `/api/*` routes verify the Supabase token and
scope all data per user):

```bash
AUTH_ENABLED=true
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
```

…and on the **dashboard** (Vite):

```bash
VITE_AUTH_ENABLED=true
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

Then, in the Supabase dashboard → **Authentication → URL Configuration**, add
your app's `/welcome` page as a redirect URL (e.g.
`http://localhost:5173/welcome` for local testing, plus your production URL).

When the flags are off, the dashboard has no login and the proxy serves all data
as a single tenant — the original zero-config experience.

> Multi-tenancy: with auth on, each user owns their API keys and only sees their
> own request logs and suggestions. API keys created before auth was enabled
> have no owner and are treated as shared/legacy.

## Editor & browser integrations

PromptLens surfaces its data where you actually work — not just the dashboard.

### Browser extension (ChatGPT & Claude)

`packages/browser-extension` is a Chrome MV3 overlay for **chatgpt.com** and
**claude.ai**. Since web chats don't route through the proxy, it works two ways:

- **Local estimate (always on)** — a floating widget shows live token counts for
  the conversation and your draft, an estimated input cost, and rule-based
  prompt-optimization tips as you type.
- **Proxy data (when reachable)** — if the proxy is running, the widget and popup
  also show your real logged spend and your top optimization suggestion.

Load it via `chrome://extensions` → **Developer mode** → **Load unpacked** →
select `packages/browser-extension`. No build step. See its
[README](packages/browser-extension/README.md).

### Desktop app

`packages/desktop` is an Electron app for a zero-terminal local experience: it
auto-starts the proxy, opens the dashboard in a native window, and shows today's
spend in the menu-bar tray. From the repo root:

```bash
npm run desktop
```

See its [README](packages/desktop/README.md).

### VSCode extension (+ Claude Code)

`packages/vscode-extension` adds a **PromptLens** panel to the Activity Bar
showing spend and optimization suggestions from the proxy, plus a command to
**route Claude Code through PromptLens**:

```bash
PROMPTLENS_ALLOW_ANON=true npm run dev:proxy   # let key-less local tools log
```

Then run **PromptLens: Route Claude Code through proxy** — it sets
`ANTHROPIC_BASE_URL=http://localhost:3001/anthropic` for new terminals, so
`claude` traffic is captured. Open the folder in VSCode and press **F5** to try
it. See its [README](packages/vscode-extension/README.md).

> `PROMPTLENS_ALLOW_ANON=true` attributes traffic that arrives without an
> `x-promptlens-key` to your default key. Intended for local single-tenant use.

## vs Helicone

Helicone shows you that you're spending money. PromptLens tells you **which
feature is responsible** and **how to spend less**.

| | Helicone | PromptLens |
|---|---|---|
| Per-request logging | ✓ | ✓ |
| Cost dashboard | ✓ | ✓ |
| **Cost attribution by feature tag** | ⚠ manual | auto-inferred from request path |
| **Top prompt templates by spend** | ⚠ partial | first-class |
| **Optimization layer** (compressed prompt suggestions) | ✘ | roadmap |

The PromptLens differentiator is the optimization layer: once we cluster your
prompts by template hash, we can suggest a shorter version that produces the
same output for a fraction of the input-token cost. Helicone stops at "here's
what you spent."

## Repository layout

```
promptlens/
├── packages/
│   ├── proxy/          # Express proxy server (Node, TypeScript) — local SQLite store
│   ├── dashboard/      # React + Vite + Tailwind + Recharts dashboard
│   └── sdk/            # npm-publishable SDK wrapper (`promptlens`)
├── examples/           # runnable customer integration demo
├── package.json        # workspace root
└── .env.example
```

## Local development

### Prerequisites

- Node.js 20+

That's it — no database or cloud account. The proxy keeps keys and request
logs in a local SQLite file at `packages/proxy/.promptlens/data.db`.

### 1. Install + seed

```bash
npm install
npm run seed     # creates the demo API key + realistic sample data
```

`npm run seed` prints a `pl_live_…` demo key (shown once) and fills the store
with 30 days of sample requests so the dashboard is populated immediately.
Re-run it any time to mint a fresh key; add `-- --reset` to wipe everything.

### 2. Configure environment (optional)

Defaults work out of the box. To point the proxy at a specific upstream (e.g.
free Groq) or change ports:

```bash
cp .env.example .env
cp .env packages/proxy/.env       # proxy reads .env from its own folder
cp .env packages/dashboard/.env   # dashboard reads VITE_* vars
```

### 3. Run

In two terminals:

```bash
# Terminal 1
npm run dev:proxy        # http://localhost:3001

# Terminal 2
npm run dev:dashboard    # http://localhost:5173
```

Open the dashboard — no login. The **API Keys** page lets you create more keys;
use any `pl_live_…` key as the `PROMPTLENS_KEY` in your application.

### 4. Smoke-test the proxy

**Free option — Groq (recommended for local dev)**

1. Get a free API key at [console.groq.com](https://console.groq.com).
2. Set in `.env` / `packages/proxy/.env`:

   ```bash
   OPENAI_UPSTREAM_URL=https://api.groq.com/openai/v1/chat/completions
   GROQ_API_KEY=gsk_...
   ```

3. Restart the proxy. You should see on startup:

   ```
   OpenAI-compatible upstream: https://api.groq.com/openai/v1/chat/completions
   ```

4. Run the smoke script:

   ```bash
   export PROMPTLENS_KEY=pl_live_…   # from dashboard → API Keys
   export GROQ_API_KEY=gsk_…
   chmod +x scripts/smoke-groq.sh
   ./scripts/smoke-groq.sh
   ```

   Or manually:

   ```bash
   curl -s http://localhost:3001/openai/v1/chat/completions \
     -H "x-promptlens-key: pl_live_…" \
     -H "Authorization: Bearer $GROQ_API_KEY" \
     -H "Content-Type: application/json" \
     -H "x-feature-tag: smoke-test" \
     -d '{"model":"llama-3.1-8b-instant","messages":[{"role":"user","content":"hi"}]}'
   ```

You should see a row land in your `requests` table within a second, and the
cost appear on `/dashboard` tagged `smoke-test`.

**OpenAI (paid)**

```bash
curl -s http://localhost:3001/health
# {"status":"ok","timestamp":"…"}
```

Unset `OPENAI_UPSTREAM_URL` (or set it to `https://api.openai.com/v1/chat/completions`) and use `Authorization: Bearer $OPENAI_API_KEY` with `"model":"gpt-4o-mini"`.

## Deployment

For a full, copy-paste step-by-step (Supabase + Fly.io + Vercel), see
[**DEPLOY.md**](./DEPLOY.md). Headline summary:

| Component | Platform | Config file |
|---|---|---|
| Proxy (Node + SQLite) | Fly.io | `Dockerfile`, `fly.toml` |
| Dashboard (Vite SPA) | Vercel | `packages/dashboard/vercel.json` |
| Auth (multi-tenant) | Supabase | env vars only |

Alternative: `render.yaml` is kept in the repo for one-click Render
deployments — same shape (Node web service + persistent disk for SQLite),
just a different host.

### Update SDK consumers

Point your client apps at the deployed proxy URL by setting `baseUrl` on
`createOpenAIConfig` (or by relying on the public default once you publish
the proxy at `https://api.promptlens.dev`).

## Privacy

By default PromptLens stores **only** structured metadata (token counts, cost,
feature tag, prompt SHA-256 hash). Full prompt content is never logged.
Set `STORE_PROMPTS=true` in the proxy environment to opt in to storing raw
prompts (not enabled in V1 — placeholder for future opt-in).

## License

MIT
