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
  /\b(whole|entire|all (the )?|every)\s*(code|codebase|repo|repository|project|files?|thing|everything)\b|\beverything\b|\bthe codebase\b/i;
const POLITENESS_RE = /\b(please|kindly|could you|would you|feel free to|if you could)\b/i;
const ACCEPTANCE_RE =
  /\b(should|so that|expected|must|done when|acceptance|returns?|output|result in|pass(es|ing)?|test)\b/i;
const PLAN_RE = /\b(plan|step[- ]by[- ]step|first .* then|outline|design)\b/i;

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

  // 1 — Name the exact files (be specific).
  if (isCoding && !hasFile) {
    suggestions.push({
      id: "name-files",
      severity: "high",
      title: "Name the exact file(s) to change",
      detail:
        'Point the agent straight at the code, e.g. "fix the auth middleware in src/auth.ts" instead of "fix the auth issue". This avoids paying tokens for it to hunt around the repo.',
    });
  }

  // 2 — Don't make it read the whole repo.
  if (VAGUE_SCOPE_RE.test(lower)) {
    suggestions.push({
      id: "avoid-whole-repo",
      severity: "high",
      title: "Don't ask it to scan the whole codebase",
      detail:
        "Reading entire files/repos is the biggest token sink. Reference the specific functions or files it needs (or paste them), so it gets just the relevant context.",
    });
  }

  // 3 — Scope the task small.
  if (tasks >= 3 || words > 180) {
    suggestions.push({
      id: "scope-small",
      severity: "medium",
      title: "Split this into smaller tasks",
      detail:
        "Big multi-part prompts balloon context and cost. Several smaller, focused tasks (or separate sessions) consistently use fewer tokens than one large one.",
    });
  }

  // 4 — Ask for a plan first on complex work.
  if ((tasks >= 3 || words > 180) && !PLAN_RE.test(lower)) {
    suggestions.push({
      id: "plan-first",
      severity: "low",
      title: "Ask for a plan before code",
      detail:
        "For anything non-trivial, have the agent produce a short plan (or use plan mode) and approve it before it writes code — it scopes the work and avoids wasted exploration.",
    });
  }

  // 5 — State the expected outcome.
  if (!ACCEPTANCE_RE.test(lower)) {
    suggestions.push({
      id: "acceptance",
      severity: "medium",
      title: "State what 'done' looks like",
      detail:
        "Add the expected result or acceptance criteria (e.g. \"the login test should pass\"). Clear targets cut back-and-forth, which is where tokens add up.",
    });
  }

  // 6 — Use a cheaper model for simple work.
  if (isCoding && tasks <= 1 && words <= 60) {
    suggestions.push({
      id: "cheaper-model",
      severity: "low",
      title: "A smaller model can likely handle this",
      detail:
        "This looks like a focused change — Sonnet/Haiku (or GPT-4o-mini) is usually plenty and far cheaper than a frontier model for simple tasks.",
    });
  }

  // 7 — Trim politeness/filler.
  if (POLITENESS_RE.test(lower)) {
    suggestions.push({
      id: "trim-filler",
      severity: "low",
      title: "Drop politeness filler",
      detail:
        'Words like "please" and "could you" don\'t help the model and add tokens on every message. Be direct.',
    });
  }

  // 8 — Standing instructions belong in CLAUDE.md.
  if (tokens > 1500) {
    suggestions.push({
      id: "use-claude-md",
      severity: "medium",
      title: "Move standing rules to CLAUDE.md",
      detail:
        "If this prompt restates project conventions/architecture, put that in CLAUDE.md once instead of re-sending it every message.",
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
