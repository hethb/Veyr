/**
 * Lightweight, privacy-safe prompt features for the personalization layer.
 *
 * Everything here is derived metadata — counts, booleans, and a structural
 * hash. None of it retains raw prompt text, so it is safe to persist in
 * `suggestion_events` under the privacy-first default (see
 * docs/prompt-personalization.md).
 */

import { sha256 } from "../utils/hash.js";

export interface PromptFeatures {
  token_estimate: number;
  word_count: number;
  /** SHA-256 of the prompt structure with variable content stripped. */
  template_hash: string;
  has_file_path: boolean;
  has_acceptance_criteria: boolean;
  has_vague_verb: boolean;
  has_output_constraint: boolean;
  /** Number of 3-grams that repeat (a cheap proxy for redundant phrasing). */
  repeated_ngrams: number;
}

const FILE_RE =
  /\b[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|c|cpp|cc|h|hpp|cs|css|scss|html|json|ya?ml|md|sql|sh|swift|kt)\b/i;
const PATH_RE = /(^|\s)[\w-]+\/[\w./-]+/;
const VAGUE_START_RE =
  /^\s*(fix|improve|optimi[sz]e|clean ?up|refactor|enhance|polish|tidy|make .* better|debug|sort out)\b/i;
const ACCEPTANCE_RE =
  /\b(should|so that|expected|must|done when|acceptance|returns?|output|result in|pass(es|ing)?|test)\b/i;
const CONSTRAINT_RE =
  /(\b\d+\s*(word|words|bullet|bullets|line|lines|sentence|sentences|paragraph|paragraphs|item|items|step|steps)\b|\bconcise\b|\bbrief(ly)?\b|\bshort\b|\btl;?dr\b|\bone[- ]?liner\b|\bbullet points?\b|\bas a table\b|\bno (preamble|explanation|prose)\b)/i;

/** Mirror of promptLint's heuristic so features line up with the linter. */
function estimateTokens(text: string): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

/**
 * Reduces a prompt to its structural skeleton, then hashes it. Two prompts that
 * differ only in their variable content (file names, ids, numbers, quoted
 * strings, interpolated placeholders) collapse to the same hash — which is what
 * lets us group "the same prompt template used many times".
 */
export function templateHash(input: string): string {
  const skeleton = (input ?? "")
    .toLowerCase()
    .replace(/```[\s\S]*?```/g, " CODE ") // fenced code blocks
    .replace(/(\{\{[^}]+\}\}|\$\{[^}]+\}|<[a-z_]{3,}>|%[sd])/gi, " VAR ") // placeholders
    .replace(/["'`][^"'`]*["'`]/g, " STR ") // quoted strings
    .replace(/\b[\w./-]+\.[a-z]{1,5}\b/gi, " PATH ") // file-ish tokens
    .replace(/\bhttps?:\/\/\S+/gi, " URL ")
    .replace(/\b\d[\d,.]*\b/g, " NUM ") // numbers
    .replace(/[^a-z\s]/g, " ") // punctuation
    .replace(/\s+/g, " ")
    .trim();
  return sha256(skeleton);
}

function repeatedNgramCount(words: string[], n = 3): number {
  if (words.length < n) return 0;
  const seen = new Map<string, number>();
  for (let i = 0; i + n <= words.length; i++) {
    const gram = words.slice(i, i + n).join(" ");
    seen.set(gram, (seen.get(gram) ?? 0) + 1);
  }
  let repeats = 0;
  for (const count of seen.values()) if (count > 1) repeats += count - 1;
  return repeats;
}

export function extractFeatures(input: string): PromptFeatures {
  const text = (input ?? "").trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  return {
    token_estimate: estimateTokens(text),
    word_count: words.length,
    template_hash: templateHash(text),
    has_file_path: FILE_RE.test(text) || PATH_RE.test(text),
    has_acceptance_criteria: ACCEPTANCE_RE.test(lower),
    has_vague_verb: VAGUE_START_RE.test(text),
    has_output_constraint: CONSTRAINT_RE.test(lower),
    repeated_ngrams: repeatedNgramCount(words.map((w) => w.toLowerCase())),
  };
}
