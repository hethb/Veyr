# PromptLens product roadmap

**Core product:** A hosted proxy between your app and OpenAI/Anthropic. Change where requests go — see (and eventually control) LLM spend by feature.

```
your app  →  PromptLens proxy  →  OpenAI / Anthropic
                 │
         observe · compress · enforce
                 │
            dashboard
```

---

## Layer 1 — Observability (**live**)

**Customer promise:** “Which feature is costing us money?”

- Proxy logs metadata (tokens, cost, model, feature tag, prompt hash — not content by default)
- Dashboard: today / week / month, cost by feature, top prompt templates
- Integration: one env var + `promptlensOpenAI()` or base URL swap

---

## Layer 2 — Optimization (**building now**)

**Customer promise:** “Stop paying for bloated prompts.”

- Rule-based system-prompt compression before upstream (ported from TokenGuard)
- Opt-in per request: `x-promptlens-compress: 1` or policy `compress_prompts`
- **Provider prompt caching** — auto-inject Anthropic `cache_control` on long
  prompts (`x-promptlens-cache: 1` or policy `enable_prompt_caching`). Tracks
  `cached_tokens` and `cache_creation_tokens` per request and discounts cost
  accordingly. Up to 90% input cost reduction on repeated calls.
- Pre-send linter flags cache-busters (live timestamps, wrong ordering)
- Response headers report estimated tokens saved
- *Next:* LLM-assisted rewrite tier, template-level savings report in dashboard

---

## Layer 3 — Governance (**foundation in progress**)

**Customer promise:** “Enforce budgets without touching every team’s codebase.”

- `feature_policies` per API key + feature tag
- Monthly budget cap → `429` when exceeded
- `max_completion_tokens` enforced on outbound requests
- *Next:* model downgrade rules, rate limits, alerts, team admin UI

---

## Positioning

| Tool | What it does |
|------|----------------|
| Helicone / LangSmith | Shows what happened |
| **PromptLens** | Changes what happens — compress, cap, block |

---

## Hosted vs self-host

- **Sell:** Hosted proxy + dashboard (`PROMPTLENS_KEY`, no database for customers to run)
- **Enterprise:** Self-host this repo; same proxy, their data plane

See [QUICKSTART.md](./QUICKSTART.md).
