import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_HEURISTICS,
  loadHeuristics,
  loadLabeledSamples,
  persistHeuristics,
  recomputeHeuristics,
  type TrainingSampleLite,
} from "./heuristicTuner.js";

function sample(length: number, label: string): TrainingSampleLite {
  return { userMessageLength: length, userFeedbackComplexity: label };
}

test("returns defaults below the minimum labeled-sample count", () => {
  const result = recomputeHeuristics([sample(100, "simple"), sample(5000, "complex")]);
  assert.equal(result.simpleMaxChars, DEFAULT_HEURISTICS.simpleMaxChars);
  assert.equal(result.complexMinChars, DEFAULT_HEURISTICS.complexMinChars);
  assert.equal(result.tunedFromSamples, 2);
});

test("learns separating thresholds from cleanly separable data", () => {
  // 30 simple ≤ 200 chars, 20 moderate ~1500, 20 complex ≥ 4000.
  const samples: TrainingSampleLite[] = [
    ...Array.from({ length: 30 }, (_, i) => sample(80 + i * 4, "simple")),
    ...Array.from({ length: 20 }, (_, i) => sample(1400 + i * 10, "moderate")),
    ...Array.from({ length: 20 }, (_, i) => sample(4000 + i * 100, "complex")),
  ];
  const result = recomputeHeuristics(samples);
  assert.equal(result.tunedFromSamples, 70);
  // Simple cut should land between the simple cluster (≤196) and moderate (≥1400).
  assert.ok(result.simpleMaxChars >= 190 && result.simpleMaxChars < 1400,
    `simpleMaxChars=${result.simpleMaxChars}`);
  // Complex cut between moderate (≤1590) and complex (≥4000).
  assert.ok(result.complexMinChars >= 1590 && result.complexMinChars < 4000,
    `complexMinChars=${result.complexMinChars}`);
});

test("thresholds are clamped to sane ranges", () => {
  // All labels identical lengths → degenerate splits get clamped.
  const samples: TrainingSampleLite[] = [
    ...Array.from({ length: 30 }, () => sample(50, "simple")),
    ...Array.from({ length: 30 }, () => sample(60, "complex")),
  ];
  const result = recomputeHeuristics(samples);
  assert.ok(result.simpleMaxChars >= 100);
  assert.ok(result.complexMinChars >= 1000);
});

test("persist/load round-trip preserves other config keys", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyr-tuner-"));
  const file = path.join(dir, "config.json");
  fs.writeFileSync(file, JSON.stringify({ autoUpdateClaudeMd: true }), "utf8");

  persistHeuristics(
    { simpleMaxChars: 250, complexMinChars: 2800, tunedFromSamples: 120 },
    file
  );
  const loaded = loadHeuristics(file);
  assert.equal(loaded.simpleMaxChars, 250);
  assert.equal(loaded.complexMinChars, 2800);

  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  assert.equal(raw.autoUpdateClaudeMd, true); // untouched

  fs.rmSync(dir, { recursive: true, force: true });
});

test("loadLabeledSamples skips unlabeled and malformed lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "veyr-tuner-"));
  const file = path.join(dir, "training-data.jsonl");
  fs.writeFileSync(
    file,
    [
      JSON.stringify({ userMessageLength: 120, userFeedbackComplexity: "simple" }),
      JSON.stringify({ userMessageLength: 999, userFeedbackComplexity: null }),
      "not-json",
      JSON.stringify({ userMessageLength: 4200, userFeedbackComplexity: "complex" }),
    ].join("\n"),
    "utf8"
  );
  const samples = loadLabeledSamples(file);
  assert.equal(samples.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});
