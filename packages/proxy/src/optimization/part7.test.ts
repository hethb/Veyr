import assert from "node:assert/strict";
import { test } from "node:test";
import { BatchApiDetector } from "./BatchApiDetector.js";
import {
  ConversationTrimmer,
  type Message,
} from "./ConversationTrimmer.js";
import { StructuredOutputEnforcer } from "./StructuredOutputEnforcer.js";

function makeMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `message number ${i} with some padding text here`,
  }));
}

// ---------------------------------------------------------------------------
// ConversationTrimmer
// ---------------------------------------------------------------------------

test("no trimming below the complexity threshold", async () => {
  const trimmer = new ConversationTrimmer({ strategy: "last_n", lastN: 10 });
  const result = await trimmer.trim(makeMessages(12), "simple");
  assert.equal(result.messagesDropped, 0);
  assert.equal(result.tokensSaved, 0);
});

test("complex tasks trigger later than simple ones", () => {
  const trimmer = new ConversationTrimmer({ strategy: "last_n", lastN: 10 });
  const messages = makeMessages(20);
  assert.equal(trimmer.shouldTrim(messages, "simple"), true); // >15
  assert.equal(trimmer.shouldTrim(messages, "complex"), false); // <=40
});

test("last_n keeps the tail, adds a notice, never trims system", async () => {
  const messages: Message[] = [
    { role: "system", content: "SYSTEM PROMPT" },
    ...makeMessages(30),
  ];
  const trimmer = new ConversationTrimmer({ strategy: "last_n", lastN: 10 });
  const result = await trimmer.trim(messages, "simple");

  assert.ok(result.trimmed.some((m) => m.role === "system"));
  assert.ok(
    String(result.trimmed.find((m) => m.role !== "system")?.content).includes(
      "earlier conversation trimmed"
    )
  );
  assert.equal(result.trimmed.length, 12); // system + notice + last 10
  assert.ok(result.tokensSaved > 0);
  assert.equal(result.messagesDropped, 31 - 12);
});

test("key_points_only keeps files/errors/decisions and the last exchange", async () => {
  const messages: Message[] = [
    { role: "system", content: "SYS" },
    { role: "user", content: "small talk" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "look at src/main.ts" },
    { role: "assistant", content: "Error: cannot find module" },
    ...makeMessages(40),
  ];
  const trimmer = new ConversationTrimmer({ strategy: "key_points_only", lastN: 10 });
  const result = await trimmer.trim(messages, "complex");
  const texts = result.trimmed.map((m) => String(m.content));
  assert.ok(texts.some((c) => c.includes("src/main.ts")));
  assert.ok(texts.some((c) => c.includes("Error: cannot find module")));
  assert.ok(texts.some((c) => c === "SYS"));
  assert.ok(!texts.some((c) => c === "small talk"));
});

test("summarize without an API key degrades to last_n", async () => {
  const trimmer = new ConversationTrimmer({
    strategy: "summarize",
    lastN: 10,
    anthropicApiKey: null,
  });
  const result = await trimmer.trim(makeMessages(30), "simple");
  assert.equal(result.strategy, "last_n");
  assert.ok(result.messagesDropped > 0);
});

// ---------------------------------------------------------------------------
// StructuredOutputEnforcer
// ---------------------------------------------------------------------------

test("detects fenced JSON examples and format headers", () => {
  const enforcer = new StructuredOutputEnforcer();
  const withFence =
    "You are an extractor. Respond precisely." +
    "x".repeat(200) +
    '\nExample response:\n```json\n{ "name": "value", "items": [1, 2, 3], "nested": { "a": true } }\n```';
  assert.equal(enforcer.detect(withFence), true);
  assert.ok(enforcer.exampleTokenEstimate(withFence) > 0);

  const plain = "You are a helpful coding assistant. Answer concisely." + "y".repeat(300);
  assert.equal(enforcer.detect(plain), false);
  // Short prompts never flag.
  assert.equal(enforcer.detect("respond in this format: {}"), false);
});

// ---------------------------------------------------------------------------
// BatchApiDetector
// ---------------------------------------------------------------------------

test("batch candidates: background tags and off-hours non-streaming", () => {
  const detector = new BatchApiDetector();
  assert.equal(
    detector.isBatchCandidate({ stream: false }, "nightly-eval", 14),
    true // tag signal
  );
  assert.equal(
    detector.isBatchCandidate({ stream: false }, "chatbot", 3),
    true // off-hours + explicit non-streaming
  );
  assert.equal(
    detector.isBatchCandidate({ stream: true }, "nightly-eval", 3),
    false // streaming never qualifies
  );
  assert.equal(
    detector.isBatchCandidate({ stream: false }, "chatbot", 14),
    false // daytime, no tag signal
  );
});
