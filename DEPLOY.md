# Deploying Veyr

This guide takes you from a freshly-pushed `main` to a public, multi-tenant
Veyr instance that anyone can sign up for via magic link.

**Architecture:**

```
┌─────────────────┐         ┌─────────────────┐
│ Dashboard (SPA) │ ──────► │  Proxy (Node)   │ ────► OpenAI / Anthropic /
│  Vercel · free  │  JWT    │  Fly.io · paid  │       Groq / Ollama / ...
└─────────────────┘         └────────┬────────┘
        ▲                            │
        │ magic-link sign in         │  SQLite on a 1GB volume
        ▼                            ▼
┌─────────────────┐            ┌──────────┐
│    Supabase     │            │ promptlens_data │
│  Auth · free    │            └──────────┘
└─────────────────┘
```

**Cost (USD, est.):**
- Fly.io shared-cpu-1x VM + 1 GB volume: free tier covers it for low traffic;
  beyond that ~$1.94/mo for the volume and ~$2/mo for the machine when running.
- Supabase free tier: 500 MB DB, 50 k MAU — plenty for a launch.
- Vercel Hobby: free for personal projects.
- A credit card on file for Fly is required (since 2024).

---

## Prerequisites

You need accounts on:
- [GitHub](https://github.com/) (the repo)
- [Fly.io](https://fly.io/) — install the CLI: `brew install flyctl`
- [Vercel](https://vercel.com/) — install the CLI: `npm i -g vercel`
- [Supabase](https://supabase.com/) — no CLI required

Your repo on GitHub should already contain the files in this guide
(`Dockerfile`, `fly.toml`, `packages/dashboard/vercel.json`).

---

## 1. Create the Supabase project

Supabase is identity-only here — no app tables to create. Veyr stores
everything (keys, requests, policies) in the proxy's SQLite.

1. Go to https://supabase.com/dashboard/projects → **New project**.
2. Pick a region near your Fly region.
3. Once it's up, open **Settings → API** and copy:
   - **Project URL** (e.g. `https://abcdefg.supabase.co`)
   - **anon public** key (long JWT — *not* the service role key)
4. Open **Authentication → Providers**. Email/Magic Link is on by default.
   Disable any provider you don't want.
5. Open **Authentication → URL Configuration**:
   - **Site URL**: set this to your Vercel URL once you have it (step 3),
     e.g. `https://promptlens.vercel.app`. For now, set it to
     `http://localhost:5173` — we'll come back.
   - **Redirect URLs**: add `https://*.vercel.app/auth/callback` and your
     final URL once known.

Hold onto `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

## 2. Deploy the proxy to Fly.io

```bash
# From the repo root:
fly auth login
fly launch --no-deploy --copy-config --name promptlens-proxy
```

When prompted:
- **App name**: pick a globally-unique one (e.g. `promptlens-yourname`).
  This becomes `https://<app-name>.fly.dev`.
- **Region**: keep `iad` or pick one near your users.
- **Postgres / Redis**: **no** to both — we use SQLite.
- **Deploy now**: **no** — we still need to create the volume.

Update `fly.toml` if `fly launch` changed `app = ...` — confirm the line at
the top matches the name you picked.

Create the persistent volume:

```bash
fly volumes create promptlens_data --size 1 --region iad
```

Set the secrets (substitute your real Supabase values):

```bash
fly secrets set \
  SUPABASE_URL="https://abcdefg.supabase.co" \
  SUPABASE_ANON_KEY="<anon-public-key>"
```

If you want to ship with a default upstream key (so brand-new signups can hit
"send" without bringing their own), also set:

```bash
fly secrets set GROQ_API_KEY="gsk_..."
```

Deploy:

```bash
fly deploy
```

When it's healthy, note the URL: `https://promptlens-yourname.fly.dev`.

Smoke-test:

```bash
curl https://promptlens-yourname.fly.dev/health
# → {"status":"ok","timestamp":"..."}
```

---

## 3. Deploy the dashboard to Vercel

From the repo root:

```bash
cd packages/dashboard
vercel link        # connect to your Vercel account, pick a project name
```

Set environment variables for the dashboard build:

```bash
vercel env add VITE_PROXY_URL production
# Paste: https://promptlens-yourname.fly.dev
vercel env add VITE_AUTH_ENABLED production
# Paste: true
vercel env add VITE_SUPABASE_URL production
# Paste: https://abcdefg.supabase.co
vercel env add VITE_SUPABASE_ANON_KEY production
# Paste: the anon public key
```

Ship it:

```bash
vercel --prod
```

Note the production URL: `https://promptlens-yourname.vercel.app`.

---

## 4. Wire the two halves together

Tell the proxy which dashboard origins are allowed to call `/api/*`:

```bash
fly secrets set DASHBOARD_ORIGIN="https://promptlens-yourname.vercel.app"
```

Tell Supabase where to redirect after magic-link clicks:
1. **Authentication → URL Configuration**
2. Set **Site URL** to `https://promptlens-yourname.vercel.app`
3. Add `https://promptlens-yourname.vercel.app/**` to **Redirect URLs**

---

## 5. Try it as a new user

1. Open `https://promptlens-yourname.vercel.app` in a fresh browser/private window.
2. Click **Sign in** → enter an email → click the magic link.
3. Land on the dashboard. You'll see empty stats — that's correct, you have
   no traffic yet.
4. **API Keys** → create a key (it shows once, copy it).
5. Send a test request:

   ```bash
   curl -X POST https://promptlens-yourname.fly.dev/openai/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "x-promptlens-key: pl_..." \
     -H "Authorization: Bearer $GROQ_API_KEY" \
     -d '{"model":"llama-3.1-8b-instant","messages":[{"role":"user","content":"hi"}]}'
   ```

6. Refresh the dashboard. You should see the request, latency, and cost.

---

## Operating notes

- **Single writer for SQLite.** `fly.toml` pins `min_machines_running = 1`.
  Do **not** scale to multiple machines without first migrating off SQLite —
  you'll get diverging databases.
- **Backups.** Snapshot the volume periodically:

  ```bash
  fly volumes snapshots list -v <volume-id>
  fly volumes snapshots create <volume-id>
  ```

- **Logs.** `fly logs` (proxy) and the Vercel dashboard (frontend).
- **Updating.** Push to `main` → on Fly, run `fly deploy` (or wire GitHub
  Actions); Vercel auto-deploys from `main`.
- **Secrets are env, not in the repo.** Anything sensitive must be set via
  `fly secrets set …` or in the Vercel project settings, never committed.

---

## Switching to a single-tenant or open-demo setup later

- **Single-tenant:** drop `AUTH_ENABLED=true`, drop the Supabase secrets,
  redeploy. You'll fall back to local key-only auth — anyone who knows a
  `pl_…` key can use the proxy, but nobody has a dashboard login.
- **Open demo:** also set `PROMPTLENS_ALLOW_ANON=true`. Logs every anonymous
  hit against the "default" key. Only do this if you trust everyone who can
  reach the URL — there's no rate-limit baked in.

---

## Rollback

```bash
fly releases               # list past deploys
fly releases rollback <n>  # roll back to release n
```

For Vercel, click **Deployments** → pick a previous successful build →
**Promote to Production**.
