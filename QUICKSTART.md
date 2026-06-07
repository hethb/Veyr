# PromptLens — 2-minute quickstart (for teams)

PromptLens is the **production** counterpart to [TokenGuard](https://github.com/hethb/TokenGuard):

| | **TokenGuard** | **PromptLens** |
|---|---|---|
| **Who** | People using ChatGPT / Claude in the browser | Engineering teams shipping LLM features |
| **Install** | Chrome extension | `npm install promptlens` + one env var |
| **What it does** | Cuts tokens in chat (optimize + strip fluff) | Tracks every API call: cost, tokens, feature, prompt template |
| **Setup** | Load extension → optional API key | Copy `PROMPTLENS_KEY` → change 2 lines in your app |

You run TokenGuard on yourself. You plug PromptLens into **your app** so finance and eng see where token spend goes.

---

## Path A — Cloud (what you sell to customers)

**Customer steps (under 5 minutes):**

1. **Sign up** at your hosted dashboard (e.g. `app.promptlens.dev`) → **API Keys** → copy `pl_live_…`
2. **In their app:**

   ```bash
   npm install promptlens openai
   ```

   ```ts
   import OpenAI from "openai";
   import { promptlensOpenAI } from "promptlens";

   const openai = new OpenAI(
     promptlensOpenAI({
       apiKey: process.env.OPENAI_API_KEY!,
       feature: "checkout-assistant", // shows up in dashboard
     })
   );

   // Existing code — no other changes
   await openai.chat.completions.create({ ... });
   ```

3. **Set env:** `PROMPTLENS_KEY=pl_live_…` (only new variable)
4. **Open dashboard** → see cost by feature, top prompts, tokens over time

**You operate:** hosted proxy + dashboard (Render + Vercel per README Deployment). The proxy persists data to a local SQLite store — no external database to run.

---

## Path B — Self-host (enterprise / dev)

For teams that want to run the proxy on their own infrastructure:

1. `npm install && npm run seed` (creates a demo key + sample data in a local SQLite store)
2. Copy `.env.example` → `.env` (see root README) — optional
3. `npm run dev:proxy` + `npm run dev:dashboard`
4. Same SDK, with:

   ```ts
   promptlensOpenAI({
     apiKey: process.env.OPENAI_API_KEY!,
     promptlensKey: process.env.PROMPTLENS_KEY!,
     baseUrl: "http://localhost:3001", // your proxy
   })
   ```

Smoke test: `./scripts/smoke-groq.sh` after creating an API key.

---

## What customers get today vs next

| Today | Roadmap (like TokenGuard’s optimize layer) |
|-------|-----------------------------------------------|
| Per-request token + USD logging | Prompt compression suggestions |
| Cost by feature tag | Automated spend alerts |
| Top prompt templates (by hash) | In-SDK “optimize before send” hook |

---

## Positioning one-liner

**TokenGuard** saves tokens in the browser. **PromptLens** shows companies which features and prompts are burning tokens in production — plug in with one key, no agent, no prompt rewrite required.
