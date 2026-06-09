/**
 * Pre-send prompt linter for coding agents (Claude Code, Cursor, etc.).
 *
 * Encodes community best practices for keeping token usage down by writing
 * better prompts *before* sending: name the exact files, scope tasks small,
 * don't make the agent read the whole repo, state acceptance criteria, and use
 * a cheaper model for simple work. Pure + in-process — no external calls.
 */

export type PromptSeverity = "high" | "medium" | "low";

export interface PromptSuggestion {
  id: string;
  severity: PromptSeverity;
  title: string;
  detail: string;
}

export interface PromptLintResult {
  token_estimate: number;
  suggestions: PromptSuggestion[];
  improved_template: string;
}

const FILE_RE =
  /\b[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|c|cpp|cc|h|hpp|cs|css|scss|html|json|ya?ml|md|sql|sh|swift|kt)\b/i;
const PATH_RE = /(^|\s)[\w-]+\/[\w./-]+/; // a/b style path
const CODING_INTENT_RE =
  /\b(fix|add|implement|refactor|debug|update|change|create|build|write|optimi[sz]e?|remove|delete|rename|migrate|wire|integrate|handle)\b/i;
const VAGUE_SCOPE_RE =
  /\b(whole|entire|all (the )?|every|across the)\s*(code|codebase|repo|repository|project|files?|thing|everything|app|application)\b|\beverything\b|\bthe codebase\b|\bread (all|the) files?\b|\blook through\b/i;
// Filler that wastes tokens on every message (input *and* output).
const POLITENESS_RE =
  /\b(please|kindly|could you|would you|feel free to|if you could|i was wondering|i want you to|i would like|can you|thanks in advance|hello|hi there|i need you to)\b/i;
const HEDGE_RE = /\b(very|really|just|basically|actually|simply|in order to|kind of|sort of|maybe|perhaps)\b/i;
const ACCEPTANCE_RE =
  /\b(should|so that|expected|must|done when|acceptance|returns?|output|result in|pass(es|ing)?|test)\b/i;
const PLAN_RE = /\b(plan|step[- ]by[- ]step|first .* then|outline|design)\b/i;
// Asks that tend to produce long output unless constrained.
const GENERATION_RE =
  /\b(write|generate|explain|describe|summari[sz]e|list|create|draft|give me|tell me|compare|analy[sz]e|review|outline|document)\b/i;
// Length/format constraints that cap output size.
const CONSTRAINT_RE =
  /(\b\d+\s*(word|words|bullet|bullets|line|lines|sentence|sentences|paragraph|paragraphs|item|items|step|steps)\b|\bconcise\b|\bbrief(ly)?\b|\bshort\b|\btl;?dr\b|\bone[- ]?liner\b|\bin \d+\b|\bbullet points?\b|\bas a table\b|\bno (preamble|explanation|prose)\b)/i;
// Vague verbs that send the agent exploring before it knows what to do.
const VAGUE_START_RE =
  /^\s*(fix|improve|optimi[sz]e|clean ?up|refactor|enhance|polish|tidy|make .* better|debug|sort out)\b/i;

// --- Cache-friendliness ---------------------------------------------------
// Real-time values that would bust a cached prefix on every send. Matches
// explicit dates (2025-06-09), ISO timestamps, "current time", "today is …",
// HH:MM clock readings, and Date.now()-style template tokens.
const TIMESTAMP_RE =
  /(\b\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:?\d{2})?)?\b|\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b|\b(current (date|time|day|timestamp|year|month)|today(?:'s)? date|right now|as of now|now is)\b|\{\{?\s*(date|now|timestamp|current_time|today)\s*\}?\}|\b(date|now|timestamp)\s*[:=]\s*new Date)/i;
// Heuristic: dynamic-looking placeholder/variable mid-prompt suggests user
// data interpolated inline. {{var}}, {var}, <var>, ${var}, %s.
const PLACEHOLDER_RE = /(\{\{[^}]+\}\}|\$\{[^}]+\}|<[A-Z_]{3,}>|%[sd])/;
// Phrases that usually mark dynamic/per-call content (user question, real-time
// data). Whichever side of the prompt these end up on, the OTHER side is the
// stable, cacheable prefix.
const DYNAMIC_MARKER_RE =
  /\b(user (question|input|query|message)|the user said|user:|<question>|<input>|here is the question|now answer|user's request|today's (data|news|prices))\b/i;
// Phrases that usually mark the static, cacheable prefix (instructions, docs,
// few-shot examples). We want these at the TOP of the prompt.
const STATIC_MARKER_RE =
  /\b(you are|your task|system instructions|guidelines|rules|policy|few[- ]shot|examples?:|reference (document|material|data)|context document|knowledge base|<documents?>|<context>)\b/i;

function estimateTokens(text: string): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

function extractFiles(text: string): string[] {
  const out = new Set<string>();
  const re = new RegExp(FILE_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[0]);
  return [...out].slice(0, 5);
}

function countTasks(text: string): number {
  // Rough proxy for "how many things am I asking for in one go".
  const ands = (text.match(/\b(and then|then|also|additionally|as well as)\b/gi) || []).length;
  const bullets = (text.match(/^\s*([-*]|\d+\.)\s+/gm) || []).length;
  const sentences = text.split(/[.!?]\s+/).filter((s) => s.trim().length > 0).length;
  return Math.max(bullets, ands + 1, Math.ceil(sentences / 2));
}

export function lintPrompt(input: string): PromptLintResult {
  const text = (input ?? "").trim();
  const suggestions: PromptSuggestion[] = [];
  const tokens = estimateTokens(text);

  if (!text) {
    return { token_estimate: 0, suggestions: [], improved_template: "" };
  }

  const lower = text.toLowerCase();
  const files = extractFiles(text);
  const hasFile = files.length > 0 || PATH_RE.test(text);
  const isCoding = CODING_INTENT_RE.test(lower);
  const tasks = countTasks(text);
  const words = text.split(/\s+/).filter(Boolean).length;

  // 1 — Vague opener: the agent has to guess, then explores (= burned tokens).
  if (VAGUE_START_RE.test(text) && (!hasFile || words <= 12)) {
    suggestions.push({
      id: "be-specific",
      severity: "high",
      title: "Too vague — say exactly what's wrong and where",
      detail:
        'Openers like "fix the bug" or "clean this up" force the agent to read around the repo to figure out what you mean. Name the symptom, the file, and the function: "the login form in src/auth.ts throws on empty email — handle it".',
    });
  }

  // 2 — Name the exact files (be specific).
  if (isCoding && !hasFile) {
    suggestions.push({
      id: "name-files",
      severity: "high",
      title: "Name the exact file(s)",
      detail:
        'Don\'t make it search. "fix the auth middleware in src/auth.ts" beats "fix the auth issue" — targeted prompts skip the expensive discovery phase.',
    });
  }

  // 3 — Don't make it read the whole repo.
  if (VAGUE_SCOPE_RE.test(lower)) {
    suggestions.push({
      id: "avoid-whole-repo",
      severity: "high",
      title: "Never say \"the whole codebase\"",
      detail:
        "Letting it read entire files/repos is the #1 token sink. Paste only the relevant functions, or list the 2-3 files that matter.",
    });
  }

  // 4 — Cap the output length/format.
  if (GENERATION_RE.test(lower) && !CONSTRAINT_RE.test(lower) && words >= 5) {
    suggestions.push({
      id: "cap-output",
      severity: "high",
      title: "Cap the output length",
      detail:
        'Without a limit the model writes a bloated essay — and you pay for every output token. Add "in 3 bullets", "under 150 words", or "code only, no explanation".',
    });
  }

  // 5 — State the expected outcome.
  if (isCoding && !ACCEPTANCE_RE.test(lower)) {
    suggestions.push({
      id: "acceptance",
      severity: "medium",
      title: "Say what 'done' looks like",
      detail:
        'Add the target, e.g. "the login test should pass". Clear acceptance criteria kill the back-and-forth where tokens pile up.',
    });
  }

  // 6 — Scope the task small.
  if (tasks >= 2 || words > 120) {
    suggestions.push({
      id: "scope-small",
      severity: "medium",
      title: "Split this into smaller tasks",
      detail:
        "Big multi-part prompts balloon context. Several small, focused asks (or fresh sessions) consistently cost less than one large one — and go off the rails less.",
    });
  }

  // 7 — Ask for a plan first on complex work.
  if ((tasks >= 3 || words > 160) && !PLAN_RE.test(lower)) {
    suggestions.push({
      id: "plan-first",
      severity: "medium",
      title: "Get a plan before any code",
      detail:
        "For non-trivial work, make it output a short plan (or use plan mode) and approve it first. This scopes the change and prevents wasted exploration.",
    });
  }

  // 8 — Trim politeness/hedging filler.
  if (POLITENESS_RE.test(lower) || HEDGE_RE.test(lower)) {
    suggestions.push({
      id: "be-direct",
      severity: "medium",
      title: "Cut the filler — be direct",
      detail:
        'Drop "please / could you / I was wondering" and hedges like "just / really / basically". They add input tokens and nudge the model toward chatty output. State the goal immediately.',
    });
  }

  // 9 — Use a cheaper model for simple work.
  if (isCoding && tasks <= 1 && words <= 80) {
    suggestions.push({
      id: "cheaper-model",
      severity: "low",
      title: "Use a cheaper model for this",
      detail:
        "This is a focused change — Sonnet/Haiku (or GPT-4o-mini) handles it for a fraction of the cost. Save the frontier model for genuinely hard problems.",
    });
  }

  // 10 — Standing instructions belong in CLAUDE.md / custom instructions.
  if (tokens > 800) {
    suggestions.push({
      id: "use-claude-md",
      severity: "medium",
      title: "Move standing rules out of the prompt",
      detail:
        "Long prompt (~" +
        tokens +
        " tokens). Anything you repeat every time — conventions, stack, formatting — belongs in CLAUDE.md or Custom Instructions, not re-sent on each message.",
    });
  }

  // 11 — Cache buster: live timestamp/date sitting in the prompt prefix.
  //      Anything that changes per-minute invalidates the cached prefix every
  //      single call. Only flag on prompts long enough to actually benefit
  //      from caching (~256 tokens / 1k chars).
  if (TIMESTAMP_RE.test(text) && tokens >= 256) {
    suggestions.push({
      id: "cache-buster-timestamp",
      severity: "high",
      title: "Remove the live timestamp — it's busting your cache",
      detail:
        "A real-time date/time in the prompt invalidates prompt-caching every minute, so you re-pay full input cost on every call. Move the timestamp to the LAST user message, or inject it as a tool call result, not into the static system prefix.",
    });
  }

  // 12 — Wrong order: dynamic content shows up before the static block. Cache
  //      hits are sequential — the first change invalidates everything after.
  //      Heuristic: dynamic marker appears in the first 25% of the prompt AND
  //      the static block sits later. The "where" matters more than the gap
  //      size — even a small user question at the top busts the cache.
  if (tokens >= 512 && DYNAMIC_MARKER_RE.test(text) && STATIC_MARKER_RE.test(text)) {
    const firstDynamic = text.search(DYNAMIC_MARKER_RE);
    const firstStatic = text.search(STATIC_MARKER_RE);
    if (
      firstDynamic >= 0 &&
      firstStatic > firstDynamic &&
      firstDynamic < text.length * 0.25
    ) {
      suggestions.push({
        id: "cache-order",
        severity: "high",
        title: "Front-load the static content for prompt caching",
        detail:
          "The user question / dynamic data appears before your reference material and instructions. Cache hits are sequential — anything before the change is wasted. Put system instructions, docs, and few-shot examples FIRST, dynamic input LAST.",
      });
    }
  }

  // 13 — Long prompt that also includes per-call placeholders interleaved
  //      throughout — likely a single string concatenating static + dynamic.
  if (tokens >= 512 && PLACEHOLDER_RE.test(text) && STATIC_MARKER_RE.test(text)) {
    suggestions.push({
      id: "cache-isolate-dynamic",
      severity: "medium",
      title: "Isolate the dynamic variables at the end",
      detail:
        "Looks like static instructions and per-call variables are interleaved (e.g. {{user_id}}, ${query}). Move every dynamic placeholder to the tail of the prompt so the long static prefix stays bit-identical and can be cached across calls.",
    });
  }

  // 14 — Just under the Anthropic ephemeral-cache minimum (~1024 tokens). On
  //      Anthropic, anything shorter can't be cached at all. Worth flagging so
  //      the user knows the threshold.
  if (tokens >= 700 && tokens < 1024 && STATIC_MARKER_RE.test(text)) {
    suggestions.push({
      id: "cache-too-short",
      severity: "low",
      title: "Just below Anthropic's cache threshold",
      detail:
        "Anthropic requires ~1024 tokens of stable prefix to cache (~512 for Haiku). You're at ~" +
        tokens +
        ". A bit more reference material in the static block — or a bigger few-shot set — could unlock cache hits and drop input cost by up to 90%.",
    });
  }

  suggestions.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return {
    token_estimate: tokens,
    suggestions,
    improved_template: buildImprovedTemplate(text, files),
  };
}

function severityRank(s: PromptSeverity): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1;
}

/** A fill-in scaffold that nudges the user toward a tighter, cheaper prompt. */
function buildImprovedTemplate(text: string, files: string[]): string {
  const fileLine = files.length ? files.join(", ") : "<exact path, e.g. src/auth.ts>";
  const firstLine = text.split(/\n/)[0].slice(0, 120);
  return [
    `Task: ${firstLine || "<one specific change>"}`,
    `File(s): ${fileLine}`,
    `Context: <paste only the relevant function(s), or link them — don't ask the agent to scan the repo>`,
    `Constraints: Make the smallest change that works. Don't read unrelated files.`,
    `Done when: <how you'll verify it's correct, e.g. "the auth test passes">`,
  ].join("\n");
}
