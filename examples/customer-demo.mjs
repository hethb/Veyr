// Veyr customer demo — exactly how a customer integrates the product.
//
// This is the whole integration: wrap the OpenAI client with veyrOpenAI()
// and keep using openai.chat.completions as normal. Every call is routed through
// the proxy, logged, and attributed to a feature tag in the dashboard.
//
// Run:
//   export VEYR_KEY=pl_live_...            # from dashboard → API Keys
//   export GROQ_API_KEY=gsk_...            # the "OpenAI key" the customer brings
//   node examples/customer-demo.mjs
//
// Then open the dashboard (http://localhost:5173) and watch spend land under
// the feature tags below.

import OpenAI from "openai";
import { veyrOpenAI } from "canopy-sdk";

const VEYR_KEY = process.env.VEYR_KEY;
const LLM_KEY = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
const BASE_URL = process.env.VEYR_BASE_URL || "http://localhost:3001";
const MODEL = process.env.DEMO_MODEL || "llama-3.1-8b-instant";

if (!VEYR_KEY) {
  console.error("Set VEYR_KEY (dashboard → API Keys → create a key).");
  process.exit(1);
}
if (!LLM_KEY) {
  console.error("Set GROQ_API_KEY (free at https://console.groq.com) or OPENAI_API_KEY.");
  process.exit(1);
}

// --- The only Veyr-specific code a customer writes ---
function clientFor(feature) {
  return new OpenAI(
    veyrOpenAI({
      apiKey: LLM_KEY,
      veyrKey: VEYR_KEY,
      baseUrl: BASE_URL,
      feature,
    })
  );
}

// Simulate two product features so the dashboard's "cost by feature" is meaningful.
const calls = [
  { feature: "support-bot", prompt: "In one sentence, what is a refund policy?" },
  { feature: "summarizer", prompt: "Summarize: the quick brown fox jumps over the lazy dog." },
  { feature: "support-bot", prompt: "Say hello to a new customer in one short line." },
];

console.log(`Routing ${calls.length} calls through Veyr (${BASE_URL}) → model ${MODEL}\n`);

for (const { feature, prompt } of calls) {
  const openai = clientFor(feature);
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
  });
  const reply = res.choices?.[0]?.message?.content?.trim() ?? "(no content)";
  const u = res.usage;
  console.log(`[${feature}] ${reply}`);
  if (u) console.log(`           tokens: prompt=${u.prompt_tokens} completion=${u.completion_tokens}\n`);
}

console.log("Done. Open the dashboard → spend is attributed to 'support-bot' and 'summarizer'.");
