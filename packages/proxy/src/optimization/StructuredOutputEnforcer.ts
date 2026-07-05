/**
 * Detects verbose JSON example blocks in system prompts (Part 7). Detection +
 * suggestion only — Veyr never invents a json_schema from examples, since a
 * wrong auto-generated schema silently corrupts responses. The suggestion
 * tells the user how to switch to real structured outputs.
 */

const FENCED_JSON_RE = /```json\s*\{[\s\S]{40,}?\}\s*```/i;
const EXAMPLE_HEADER_RE =
  /(example (response|output)|respond in this format|output format|response format)[:\s]*\n?\s*[`{]/i;

export class StructuredOutputEnforcer {
  /** True when the system prompt appears to carry multi-line JSON examples. */
  detect(systemPrompt: string): boolean {
    if (!systemPrompt || systemPrompt.length < 200) return false;
    if (FENCED_JSON_RE.test(systemPrompt)) return true;
    if (EXAMPLE_HEADER_RE.test(systemPrompt)) {
      // Require an actual multi-line JSON-looking block to avoid false hits.
      const braceBlock = systemPrompt.match(/\{[\s\S]{60,2000}?\}/);
      if (braceBlock && braceBlock[0].includes('"') && braceBlock[0].includes("\n")) {
        return true;
      }
    }
    return false;
  }

  suggest(_systemPrompt: string): string {
    return (
      "This system prompt contains example JSON responses. Using OpenAI structured " +
      "outputs (response_format: json_schema) or Anthropic tool schemas removes the " +
      "need for examples and reduces input tokens by ~30%."
    );
  }

  /** Rough size of the example block(s), for savings estimates. */
  exampleTokenEstimate(systemPrompt: string): number {
    const matches = systemPrompt.match(/```json[\s\S]*?```|\{[\s\S]{60,2000}?\}/gi) ?? [];
    const chars = matches.reduce((sum, m) => sum + m.length, 0);
    return Math.ceil(chars / 4);
  }
}
