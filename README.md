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
│   ├── proxy/          # Express proxy server (Node, TypeScript)
│   ├── dashboard/      # React + Vite + Tailwind + Recharts dashboard
│   └── sdk/            # npm-publishable SDK wrapper (`promptlens`)
├── supabase/
│   └── migrations/     # SQL migrations
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
