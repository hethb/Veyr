/**
 * Weekly self-tuning for quickComplexityEstimate's character thresholds.
 *
 * Reads user-labeled training samples the Mac app collects at
 * `~/.veyr/ml/training-data.jsonl`, finds the character-length cut points that
 * best separate simple/complex in the labeled data (single-feature decision
 * stumps — pure statistics, no ML framework), and persists them to
 * `~/.veyr/config.json` where the complexity heuristic picks them up.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export interface TrainingSampleLite {
  userMessageLength: number;
  userFeedbackComplexity: string | null;
}

export interface HeuristicConfig {
  /** Below this many chars a prompt leans "simple" (default 300). */
  simpleMaxChars: number;
  /** Above this many chars a prompt leans "complex" (default 3000). */
  complexMinChars: number;
  /** Labeled sample count the thresholds were computed from. */
  tunedFromSamples: number;
}

export const DEFAULT_HEURISTICS: HeuristicConfig = {
  simpleMaxChars: 300,
  complexMinChars: 3000,
  tunedFromSamples: 0,
};

const MIN_LABELED_SAMPLES = 50;

export function trainingDataPath(): string {
  return path.join(os.homedir(), ".veyr", "ml", "training-data.jsonl");
}

export function veyrConfigPath(): string {
  return path.join(os.homedir(), ".veyr", "config.json");
}

export function loadLabeledSamples(
  file: string = trainingDataPath()
): TrainingSampleLite[] {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const samples: TrainingSampleLite[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (
        typeof parsed.userMessageLength === "number" &&
        typeof parsed.userFeedbackComplexity === "string"
      ) {
        samples.push({
          userMessageLength: parsed.userMessageLength,
          userFeedbackComplexity: parsed.userFeedbackComplexity,
        });
      }
    } catch {
      // Skip malformed lines.
    }
  }
  return samples;
}

/**
 * Finds the char-length threshold that best separates two labeled classes by
 * maximizing classification accuracy over candidate cut points (a decision
 * stump). Returns null when either class is missing.
 */
function bestSplit(
  lengths: { value: number; positive: boolean }[]
): number | null {
  const positives = lengths.filter((s) => s.positive).length;
  if (positives === 0 || positives === lengths.length) return null;

  const candidates = [...new Set(lengths.map((s) => s.value))].sort(
    (a, b) => a - b
  );
  let best: { threshold: number; accuracy: number } | null = null;
  for (const threshold of candidates) {
    // Rule: value <= threshold → positive class.
    let correct = 0;
    for (const s of lengths) {
      const predicted = s.value <= threshold;
      if (predicted === s.positive) correct += 1;
    }
    const accuracy = correct / lengths.length;
    if (!best || accuracy > best.accuracy) best = { threshold, accuracy };
  }
  return best ? best.threshold : null;
}

export function recomputeHeuristics(
  samples: TrainingSampleLite[]
): HeuristicConfig {
  const labeled = samples.filter((s) => s.userFeedbackComplexity !== null);
  if (labeled.length < MIN_LABELED_SAMPLES) {
    return { ...DEFAULT_HEURISTICS, tunedFromSamples: labeled.length };
  }

  // simpleMaxChars: separate "simple" from everything else.
  const simpleSplit = bestSplit(
    labeled.map((s) => ({
      value: s.userMessageLength,
      positive: s.userFeedbackComplexity === "simple",
    }))
  );
  // complexMinChars: separate "complex" (above) from everything else (below).
  const complexSplit = bestSplit(
    labeled.map((s) => ({
      value: s.userMessageLength,
      positive: s.userFeedbackComplexity !== "complex",
    }))
  );

  const simpleMaxChars = clamp(
    simpleSplit ?? DEFAULT_HEURISTICS.simpleMaxChars,
    100,
    1000
  );
  const complexMinChars = clamp(
    complexSplit ?? DEFAULT_HEURISTICS.complexMinChars,
    Math.max(simpleMaxChars * 2, 1000),
    10000
  );

  return { simpleMaxChars, complexMinChars, tunedFromSamples: labeled.length };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Writes tuned thresholds into ~/.veyr/config.json (other keys preserved). */
export function persistHeuristics(
  config: HeuristicConfig,
  file: string = veyrConfigPath()
): void {
  let existing: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    // Missing/invalid file — start fresh.
  }
  existing.complexityHeuristics = config;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
}

export function loadHeuristics(
  file: string = veyrConfigPath()
): HeuristicConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      unknown
    >;
    const h = parsed.complexityHeuristics as Partial<HeuristicConfig> | undefined;
    if (
      h &&
      typeof h.simpleMaxChars === "number" &&
      typeof h.complexMinChars === "number"
    ) {
      return {
        simpleMaxChars: h.simpleMaxChars,
        complexMinChars: h.complexMinChars,
        tunedFromSamples: typeof h.tunedFromSamples === "number" ? h.tunedFromSamples : 0,
      };
    }
  } catch {
    // Fall through to defaults.
  }
  return DEFAULT_HEURISTICS;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Runs once at proxy start, then weekly. Silent no-op without labeled data. */
export function startHeuristicTuner(): void {
  const run = (): void => {
    try {
      const samples = loadLabeledSamples();
      const tuned = recomputeHeuristics(samples);
      if (tuned.tunedFromSamples >= MIN_LABELED_SAMPLES) {
        persistHeuristics(tuned);
        console.log(
          `[veyr] complexity heuristics tuned from ${tuned.tunedFromSamples} labeled samples: ` +
            `simple<=${tuned.simpleMaxChars} chars, complex>=${tuned.complexMinChars} chars`
        );
      }
    } catch (err) {
      console.error("[veyr] heuristic tuner failed:", err);
    }
  };
  run();
  setInterval(run, WEEK_MS).unref();
}
