/**
 * Fast local task-complexity heuristic — no LLM call, runs on every request.
 * The full Haiku classifier (Mac app) is only consulted for borderline cases
 * and offline analysis; the proxy hot path stays deterministic.
 */

import { DEFAULT_HEURISTICS, loadHeuristics, type HeuristicConfig } from "./heuristicTuner.js";

export type TaskComplexity = "simple" | "moderate" | "complex";

// Tuned thresholds from ~/.veyr/config.json (written by the weekly tuner from
// user-labeled samples); loaded once per process, defaults otherwise.
let heuristics: HeuristicConfig | null = null;
function thresholds(): HeuristicConfig {
  if (!heuristics) {
    try {
      heuristics = loadHeuristics();
    } catch {
      heuristics = DEFAULT_HEURISTICS;
    }
  }
  return heuristics;
}

/** Test hook: force a re-read of tuned thresholds. */
export function resetHeuristicsCache(): void {
  heuristics = null;
}

export function quickComplexityEstimate(
  systemPrompt: string,
  userMessage: string
): TaskComplexity {
  const { simpleMaxChars, complexMinChars } = thresholds();
  const totalChars = (systemPrompt + userMessage).length;
  const hasCodeBlock = /```/.test(userMessage);
  const hasMultipleFiles =
    (userMessage.match(/\.(ts|js|py|swift|go|rs)\b/g) || []).length > 2;
  const isQuestion = userMessage.trim().endsWith("?") && totalChars < 500;
  const isSimpleCommand =
    /^(read|open|show|list|find|grep|cat|ls|pwd|cd|git status)/i.test(
      userMessage.trim()
    );

  if (isSimpleCommand || (isQuestion && totalChars < simpleMaxChars)) return "simple";
  if (hasMultipleFiles || totalChars > complexMinChars) return "complex";
  if (hasCodeBlock || totalChars > 1000) return "moderate";
  return "simple";
}

// ---------------------------------------------------------------------------
// Request-body text extraction (provider-specific, tolerant of malformed input)
// ---------------------------------------------------------------------------

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const obj = asObject(block);
      return obj && obj.type === "text" && typeof obj.text === "string"
        ? obj.text
        : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** System prompt + first user message text for either provider's body shape. */
export function extractPromptTexts(
  rawBody: unknown,
  provider: "openai" | "anthropic"
): { systemPrompt: string; firstUserMessage: string } {
  const body = asObject(rawBody);
  if (!body) return { systemPrompt: "", firstUserMessage: "" };

  let systemPrompt = "";
  let firstUserMessage = "";
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (provider === "anthropic") {
    systemPrompt = textOfContent(body.system);
  }

  for (const message of messages) {
    const obj = asObject(message);
    if (!obj) continue;
    if (provider === "openai" && !systemPrompt && (obj.role === "system" || obj.role === "developer")) {
      systemPrompt = textOfContent(obj.content);
    }
    if (!firstUserMessage && obj.role === "user") {
      firstUserMessage = textOfContent(obj.content);
    }
    if (systemPrompt && firstUserMessage) break;
  }

  return { systemPrompt, firstUserMessage };
}
