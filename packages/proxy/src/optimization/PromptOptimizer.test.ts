import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractPromptTexts,
  quickComplexityEstimate,
} from "./complexity.js";
import {
  recordAndShouldAutoCache,
  resetCacheHeuristics,
} from "./cacheHeuristics.js";
import { PromptOptimizer, strategyFor } from "./PromptOptimizer.js";
import { transformAnthropicBody } from "./transformAnthropic.js";

// ---------------------------------------------------------------------------
// quickComplexityEstimate
// ---------------------------------------------------------------------------

test("simple: short commands and short questions", () => {
  assert.equal(quickComplexityEstimate("", "read src/main.ts"), "simple");
  assert.equal(quickComplexityEstimate("", "git status"), "simple");
  assert.equal(quickComplexityEstimate("", "what does this do?"), "simple");
});

test("complex: many file references or very long input", () => {
  assert.equal(
    quickComplexityEstimate("", "refactor a.ts, b.ts, c.ts to use the new API"),
    "complex"
  );
  assert.equal(quickComplexityEstimate("x".repeat(3200), "design this"), "complex");
});

test("moderate: code blocks or medium-length prompts", () => {
  assert.equal(
    quickComplexityEstimate("", "fix this:\n```\nconst x = 1\n```" + "y".repeat(400)),
    "moderate"
  );
});

test("extractPromptTexts handles both provider shapes", () => {
  const anthropic = extractPromptTexts(
    { system: "sys", messages: [{ role: "user", content: "hi" }] },
    "anthropic"
  );
  assert.deepEqual(anthropic, { systemPrompt: "sys", firstUserMessage: "hi" });

  const openai = extractPromptTexts(
    {
      messages: [
        { role: "system", content: "sys2" },
        { role: "user", content: [{ type: "text", text: "blocks" }] },
      ],
    },
    "openai"
  );
  assert.deepEqual(openai, { systemPrompt: "sys2", firstUserMessage: "blocks" });
});

// ---------------------------------------------------------------------------
// PromptOptimizer strategies
// ---------------------------------------------------------------------------

const BLOATED = `<!-- internal note -->
You are a helpful assistant that helps with code.

Please read the file. Kindly be careful. I'd be happy to help.


In summary:
- do thing one
- do thing two

Thanks in advance!`;

test("simple → aggressive: comments, filler, boilerplate all removed", () => {
  const result = new PromptOptimizer().optimize(BLOATED, "simple", "anthropic");
  assert.equal(result.strategy, "aggressive");
  assert.ok(!result.optimizedPrompt.includes("<!--"));
  assert.ok(!/please|kindly/i.test(result.optimizedPrompt));
  assert.ok(!/helpful assistant/i.test(result.optimizedPrompt));
  assert.ok(result.reductionPct >= 20, `got ${result.reductionPct}%`);
  assert.ok(result.techniquesApplied.includes("filler_phrase_removal"));
});

test("moderate: filler removed but role/boilerplate preserved", () => {
  const result = new PromptOptimizer().optimize(BLOATED, "moderate", "anthropic");
  assert.equal(result.strategy, "moderate");
  assert.ok(!/\bplease\b/i.test(result.optimizedPrompt));
  assert.ok(/You are a helpful assistant/i.test(result.optimizedPrompt));
});

test("complex → preserve: content untouched except greetings/signoffs", () => {
  const result = new PromptOptimizer().optimize(BLOATED, "complex", "anthropic");
  assert.equal(result.strategy, "preserve");
  assert.ok(result.optimizedPrompt.includes("<!-- internal note -->"));
  // Tiny fixture: one removed signoff line is already ~10%. On real prompts
  // preserve stays in the 0-5% band; here we just bound it loosely.
  assert.ok(result.reductionPct <= 15);
});

test("degenerate rewrites fall back to the original", () => {
  // A prompt made of nothing but filler would be nearly erased — must not be.
  const filler = "Please kindly please kindly ".repeat(30);
  const result = new PromptOptimizer().optimize(filler, "simple", "openai");
  assert.ok(result.reductionPct <= 90);
});

test("strategyFor mapping", () => {
  assert.equal(strategyFor("simple"), "aggressive");
  assert.equal(strategyFor("moderate"), "moderate");
  assert.equal(strategyFor("complex"), "preserve");
});

// ---------------------------------------------------------------------------
// Auto-cache heuristics
// ---------------------------------------------------------------------------

test("auto-cache fires on 4th sighting of a big prompt within the hour", () => {
  resetCacheHeuristics();
  const now = Date.now();
  assert.equal(recordAndShouldAutoCache("h1", 600, now), false);
  assert.equal(recordAndShouldAutoCache("h1", 600, now + 1000), false);
  assert.equal(recordAndShouldAutoCache("h1", 600, now + 2000), false);
  assert.equal(recordAndShouldAutoCache("h1", 600, now + 3000), true);
});

test("auto-cache ignores small prompts and stale sightings", () => {
  resetCacheHeuristics();
  const now = Date.now();
  for (let i = 0; i < 5; i++) {
    assert.equal(recordAndShouldAutoCache("small", 400, now + i), false);
  }
  // 3 sightings an hour ago + 1 now → window excludes the old ones.
  resetCacheHeuristics();
  const old = now - 2 * 60 * 60 * 1000;
  recordAndShouldAutoCache("h2", 600, old);
  recordAndShouldAutoCache("h2", 600, old + 1);
  recordAndShouldAutoCache("h2", 600, old + 2);
  assert.equal(recordAndShouldAutoCache("h2", 600, now), false);
});

// ---------------------------------------------------------------------------
// Transform integration (complexity-aware path)
// ---------------------------------------------------------------------------

test("anthropic transform uses strategy and reports telemetry", () => {
  const result = transformAnthropicBody(
    { system: BLOATED, messages: [{ role: "user", content: "read a file" }] },
    { compress: true, complexity: "simple" }
  );
  assert.equal(result.optimizationStrategy, "aggressive");
  assert.ok(result.compressionApplied);
  assert.ok(result.originalPromptTokens > result.optimizedPromptTokens);
  assert.ok(result.techniquesApplied.length > 0);
});

test("anthropic transform preserves complex prompts", () => {
  const result = transformAnthropicBody(
    { system: BLOATED, messages: [{ role: "user", content: "design a system" }] },
    { compress: true, complexity: "complex" }
  );
  assert.equal(result.optimizationStrategy, "preserve");
  const sys = result.body.system;
  assert.ok(typeof sys === "string" && sys.includes("<!-- internal note -->"));
});
