#!/usr/bin/env bash
# End-to-end smoke test: PromptLens proxy → Groq → local SQLite logging
#
# Prerequisites:
#   1. Set OPENAI_UPSTREAM_URL to Groq (see .env.example) — optional
#   2. npm run seed (creates a demo PROMPTLENS_KEY) and npm run dev:proxy
#   3. Use the seeded key, or create one in the dashboard → PROMPTLENS_KEY
#   4. Get a free Groq key at https://console.groq.com → GROQ_API_KEY
#
# Usage:
#   export PROMPTLENS_KEY=pl_live_...
#   export GROQ_API_KEY=gsk_...
#   ./scripts/smoke-groq.sh
#
# Optional:
#   PROXY_URL=http://localhost:3001
#   GROQ_MODEL=llama-3.1-8b-instant

set -euo pipefail

PROXY_URL="${PROXY_URL:-http://localhost:3001}"
GROQ_MODEL="${GROQ_MODEL:-llama-3.1-8b-instant}"
FEATURE_TAG="${FEATURE_TAG:-groq-smoke-test}"

if [[ -z "${PROMPTLENS_KEY:-}" ]]; then
  echo "Error: set PROMPTLENS_KEY (create one in the dashboard → API Keys)" >&2
  exit 1
fi

if [[ -z "${GROQ_API_KEY:-}" ]]; then
  echo "Error: set GROQ_API_KEY (free at https://console.groq.com)" >&2
  exit 1
fi

echo "→ Health check ${PROXY_URL}/health"
health=$(curl -sf "${PROXY_URL}/health")
echo "  ${health}"

echo "→ Chat completion via PromptLens → Groq (model: ${GROQ_MODEL})"
response=$(curl -sf "${PROXY_URL}/openai/v1/chat/completions" \
  -H "x-promptlens-key: ${PROMPTLENS_KEY}" \
  -H "Authorization: Bearer ${GROQ_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "x-feature-tag: ${FEATURE_TAG}" \
  -d "{\"model\":\"${GROQ_MODEL}\",\"messages\":[{\"role\":\"user\",\"content\":\"Reply with exactly: PromptLens OK\"}]}")

content=$(echo "$response" | node -e "
  let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
    const j=JSON.parse(d);
    console.log(j.choices?.[0]?.message?.content ?? '(no content)');
    const u=j.usage;
    if(u) console.error('  tokens: prompt='+u.prompt_tokens+' completion='+u.completion_tokens);
  });
" 2>&1)

echo "  Assistant: ${content}"
echo ""
echo "✓ Request succeeded. Open /dashboard (or GET /api/stats/by-tag) for tag \"${FEATURE_TAG}\"."
