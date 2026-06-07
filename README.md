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
- `x-promptlens-max-tokens: 512` — cap completion tokens on outbound requests

Per-feature policies (dashboard API `PUT /api/policies`):

- `monthly_budget_usd` — returns `429` when feature spend exceeds cap
- `compress_prompts` — always compress for that feature
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
6. **Bursty traffic / low cache efficiency** — a feature sends repeated bursts
   (20+ calls within 10 minutes, more than 3 times in 7 days). Enable provider
   prompt caching.
7. **Quick win** — whichever live suggestion has the highest estimated saving is
   highlighted so you know where to start.

A suggestion is only surfaced when the evidence clears its threshold — no false
positives. Suggestions are most meaningful after **at least 7 days of traffic**;
with little data the panel simply says there's nothing to suggest yet.

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

### Proxy → Railway

1. Create a new Railway project. Add the PromptLens repo and set the **root directory** to `packages/proxy`.
2. Set the **Build command** to `npm install --workspaces && npm run build:proxy` (run from repo root).
3. Set the **Start command** to `node packages/proxy/dist/index.js`.
4. Add environment variables: `PORT` (Railway sets this automatically), `DASHBOARD_ORIGIN` (your Vercel URL, comma-separated if multiple), `OPENAI_UPSTREAM_URL` (optional), and `PROMPTLENS_DB_PATH` pointing at a mounted volume so the SQLite store persists across deploys.
5. Deploy. Note the public URL. Run `npm run seed` (or create a key in the dashboard) once against the volume to mint a key.

### Dashboard → Vercel

1. Import the repo into Vercel.
2. Set the **root directory** to `packages/dashboard`.
3. Build command: `npm run build` (Vercel detects Vite automatically).
4. Output directory: `dist`.
5. Environment variables: `VITE_PROXY_URL` (your Railway URL).
6. Deploy.

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
