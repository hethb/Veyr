/**
 * Seeds the local SQLite store with a fixed demo API key plus realistic request
 * history, so the dashboard is fully populated on first visit (no Supabase, no
 * login required).
 *
 *   npm run seed            # refresh demo data (keeps any other keys)
 *   npm run seed -- --reset # wipe ALL tables first
 */
import "dotenv/config";
import { getDb, resolveDbPath } from "./storage/db.js";
import { createApiKey, insertRequest } from "./storage/store.js";
import { calculateCost } from "./utils/costs.js";
import { generateApiKey } from "./utils/keys.js";
import { sha256 } from "./utils/hash.js";

const DEMO_KEY_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_KEY_NAME = "Demo";
const REQUEST_COUNT = 150;
const DAYS = 30;

interface Template {
  featureTag: string;
  systemPrompt: string;
  models: string[];
  promptRange: [number, number];
  completionRange: [number, number];
  weight: number;
}

const TEMPLATES: Template[] = [
  {
    featureTag: "support-bot",
    systemPrompt: "You are a helpful customer support agent for Acme Inc. Answer concisely and cite the relevant policy.",
    models: ["gpt-4o-mini", "gpt-4o", "llama-3.1-8b-instant"],
    promptRange: [400, 1200],
    completionRange: [80, 300],
    weight: 5,
  },
  {
    featureTag: "summarizer",
    systemPrompt: "Summarize the following document into 3 bullet points. Be faithful to the source.",
    models: ["gpt-4o-mini", "claude-3-5-haiku-20241022"],
    promptRange: [1500, 6000],
    completionRange: [120, 400],
    weight: 4,
  },
  {
    featureTag: "onboarding-email",
    systemPrompt: "Write a warm onboarding email for a new SaaS user. Keep it under 120 words.",
    models: ["gpt-4o-mini", "gpt-4o"],
    promptRange: [200, 500],
    completionRange: [100, 220],
    weight: 2,
  },
  {
    featureTag: "search-rerank",
    systemPrompt: "Rank the candidate passages by relevance to the query. Return JSON.",
    models: ["llama-3.1-8b-instant", "gpt-4o-mini"],
    promptRange: [800, 2500],
    completionRange: [40, 120],
    weight: 3,
  },
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function weightedTemplate(): Template {
  const total = TEMPLATES.reduce((s, t) => s + t.weight, 0);
  let r = Math.random() * total;
  for (const t of TEMPLATES) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return TEMPLATES[0];
}

function main(): void {
  const reset = process.argv.includes("--reset");
  const db = getDb();

  if (reset) {
    db.exec("DELETE FROM requests; DELETE FROM feature_policies; DELETE FROM api_keys;");
    console.log("Reset: cleared all tables.");
  } else {
    // Refresh just the demo key + its data so seeding stays idempotent.
    db.prepare("DELETE FROM requests WHERE api_key_id = ?").run(DEMO_KEY_ID);
    db.prepare("DELETE FROM api_keys WHERE id = ?").run(DEMO_KEY_ID);
  }

  const { raw, hash, prefix } = generateApiKey();
  createApiKey({ id: DEMO_KEY_ID, name: DEMO_KEY_NAME, hash, prefix });

  const now = Date.now();
  const spanMs = DAYS * 24 * 60 * 60 * 1000;
  let totalCost = 0;

  const insertMany = db.transaction(() => {
    for (let i = 0; i < REQUEST_COUNT; i++) {
      const t = TEMPLATES.length ? weightedTemplate() : TEMPLATES[0];
      const model = pick(t.models);
      const promptTokens = randInt(t.promptRange[0], t.promptRange[1]);
      const completionTokens = randInt(t.completionRange[0], t.completionRange[1]);
      const isError = Math.random() < 0.05;
      const ts = new Date(now - Math.random() * spanMs).toISOString();
      const provider = model.startsWith("claude") ? "anthropic" : "openai";

      const cost = isError ? 0 : calculateCost(model, promptTokens, completionTokens);
      totalCost += cost;

      insertRequest({
        apiKeyId: DEMO_KEY_ID,
        model,
        provider,
        featureTag: t.featureTag,
        promptTokens: isError ? 0 : promptTokens,
        completionTokens: isError ? 0 : completionTokens,
        totalTokens: isError ? 0 : promptTokens + completionTokens,
        costUsd: cost,
        latencyMs: randInt(180, 2200),
        status: isError ? "error" : "success",
        finishReason: isError ? null : "stop",
        promptHash: sha256(t.systemPrompt),
        errorMessage: isError ? "upstream_rate_limited" : null,
        compressionApplied: false,
        tokensSavedEstimate: 0,
        timestamp: ts,
      });
    }
  });
  insertMany();

  console.log("");
  console.log("PromptLens local store seeded.");
  console.log(`  DB:        ${resolveDbPath()}`);
  console.log(`  Requests:  ${REQUEST_COUNT} across ${DAYS} days`);
  console.log(`  Est. cost: $${totalCost.toFixed(4)}`);
  console.log("");
  console.log("Demo API key (use with the SDK / examples/customer-demo.mjs):");
  console.log(`  ${raw}`);
  console.log("");
  console.log("This key is shown ONCE. Re-run `npm run seed` to mint a new one.");
}

main();
