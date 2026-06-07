/**
 * Seeds the local SQLite store with a fixed demo API key plus realistic request
 * history, so the dashboard is fully populated on first visit (no external
 * database, no login required).
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
const DAY_MS = 24 * 60 * 60 * 1000;

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

// ---------------------------------------------------------------------------
// Scenarios — deliberately shaped traffic so the optimization rules fire.
// ---------------------------------------------------------------------------
interface Scenario {
  featureTag: string;
  systemPrompt: string;
  model: string;
  count: number;
  promptRange: [number, number];
  completionRange: [number, number];
  errorRate: number;
  /** Restrict timestamps to the last N days (default 30). */
  withinDays?: number;
  /** Emit clustered bursts instead of uniform spread (for the caching rule). */
  bursts?: { windows: number; callsPerWindow: number; spreadDays: number };
}

const SCENARIOS: Scenario[] = [
  // Rule 1 (expensive model on a simple tag) + likely Rule 4 (dominates spend).
  {
    featureTag: "title-generator",
    systemPrompt: "Generate a concise, catchy title for the given content.",
    model: "claude-3-opus-20240229",
    count: 350,
    promptRange: [200, 400],
    completionRange: [120, 300],
    errorRate: 0,
  },
  // Rule 2 (ballooning completion tokens).
  {
    featureTag: "blog-writer",
    systemPrompt: "Write a long-form blog post from the outline provided.",
    model: "gpt-4o",
    count: 260,
    promptRange: [150, 350],
    completionRange: [900, 1500],
    errorRate: 0,
  },
  // Rule 3 (high error rate burning tokens, within the 7d window).
  {
    featureTag: "flaky-extractor",
    systemPrompt: "Extract structured fields from the document as JSON.",
    model: "gpt-4o-mini",
    count: 45,
    promptRange: [300, 700],
    completionRange: [80, 200],
    errorRate: 0.3,
    withinDays: 7,
  },
  // Rule 5 (redundant long prompt template, same hash, high volume).
  {
    featureTag: "rag-pipeline",
    systemPrompt:
      "You are an AI assistant that answers questions strictly using the provided context documents. " +
      "Always cite sources. Never fabricate. Follow the company style guide. ".repeat(8),
    model: "gpt-4o",
    count: 80,
    promptRange: [900, 1300],
    completionRange: [150, 350],
    errorRate: 0,
  },
  // Rule 6 (bursty traffic -> prompt caching opportunity, within 7d).
  {
    featureTag: "notify-batch",
    systemPrompt: "Draft a short notification message for the event.",
    model: "gpt-4o-mini",
    count: 0, // computed from bursts
    promptRange: [200, 400],
    completionRange: [60, 140],
    errorRate: 0,
    withinDays: 7,
    bursts: { windows: 4, callsPerWindow: 25, spreadDays: 6 },
  },
];

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
  let totalRequests = 0;

  function emit(opts: {
    featureTag: string;
    systemPrompt: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    isError: boolean;
    ts: string;
  }): void {
    const provider = opts.model.startsWith("claude") ? "anthropic" : "openai";
    const cost = opts.isError
      ? 0
      : calculateCost(opts.model, opts.promptTokens, opts.completionTokens);
    totalCost += cost;
    totalRequests += 1;
    insertRequest({
      apiKeyId: DEMO_KEY_ID,
      model: opts.model,
      provider,
      featureTag: opts.featureTag,
      promptTokens: opts.isError ? 0 : opts.promptTokens,
      completionTokens: opts.isError ? 0 : opts.completionTokens,
      totalTokens: opts.isError ? 0 : opts.promptTokens + opts.completionTokens,
      costUsd: cost,
      latencyMs: randInt(180, 2200),
      status: opts.isError ? "error" : "success",
      finishReason: opts.isError ? null : "stop",
      promptHash: sha256(opts.systemPrompt),
      errorMessage: opts.isError ? "upstream_rate_limited" : null,
      compressionApplied: false,
      tokensSavedEstimate: 0,
      timestamp: opts.ts,
    });
  }

  const insertMany = db.transaction(() => {
    // Baseline mixed traffic.
    for (let i = 0; i < REQUEST_COUNT; i++) {
      const t = weightedTemplate();
      emit({
        featureTag: t.featureTag,
        systemPrompt: t.systemPrompt,
        model: pick(t.models),
        promptTokens: randInt(t.promptRange[0], t.promptRange[1]),
        completionTokens: randInt(t.completionRange[0], t.completionRange[1]),
        isError: Math.random() < 0.05,
        ts: new Date(now - Math.random() * spanMs).toISOString(),
      });
    }

    // Shaped scenarios that trigger the optimization rules.
    for (const s of SCENARIOS) {
      if (s.bursts) {
        const { windows, callsPerWindow, spreadDays } = s.bursts;
        for (let w = 0; w < windows; w++) {
          const burstStart = now - randInt(0, spreadDays) * DAY_MS - randInt(0, 12) * 60 * 60 * 1000;
          for (let c = 0; c < callsPerWindow; c++) {
            const ts = new Date(burstStart + randInt(0, 5 * 60 * 1000)).toISOString();
            emit({
              featureTag: s.featureTag,
              systemPrompt: s.systemPrompt,
              model: s.model,
              promptTokens: randInt(s.promptRange[0], s.promptRange[1]),
              completionTokens: randInt(s.completionRange[0], s.completionRange[1]),
              isError: false,
              ts,
            });
          }
        }
        continue;
      }

      const windowMs = (s.withinDays ?? DAYS) * DAY_MS;
      for (let i = 0; i < s.count; i++) {
        emit({
          featureTag: s.featureTag,
          systemPrompt: s.systemPrompt,
          model: s.model,
          promptTokens: randInt(s.promptRange[0], s.promptRange[1]),
          completionTokens: randInt(s.completionRange[0], s.completionRange[1]),
          isError: Math.random() < s.errorRate,
          ts: new Date(now - Math.random() * windowMs).toISOString(),
        });
      }
    }
  });
  insertMany();

  console.log("");
  console.log("PromptLens local store seeded.");
  console.log(`  DB:        ${resolveDbPath()}`);
  console.log(`  Requests:  ${totalRequests} across ${DAYS} days`);
  console.log(`  Est. cost: $${totalCost.toFixed(4)}`);
  console.log("");
  console.log("Demo API key (use with the SDK / examples/customer-demo.mjs):");
  console.log(`  ${raw}`);
  console.log("");
  console.log("This key is shown ONCE. Re-run `npm run seed` to mint a new one.");
}

main();
