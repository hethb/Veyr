import type { ConvertResult } from "./types.js";

/**
 * JSON → Markdown.
 *
 * For most JSON we just pretty-print into a fenced code block — the model
 * understands fenced JSON natively and we don't risk semantic loss.
 *
 * For a top-level array of flat objects (a common API response shape) we
 * emit a Markdown table, which tends to be 2-3x more token-efficient than
 * the raw JSON for tabular data — exactly the sort of bloat MarkItDown
 * tries to squeeze out.
 */
export function convertJson(input: string): ConvertResult {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch (err) {
    return {
      markdown: "```\n" + input.trim() + "\n```",
      format: "json",
      notes: [
        `not valid JSON (${
          err instanceof Error ? err.message : "parse failed"
        }) — wrapped as fenced text`,
      ],
    };
  }

  if (Array.isArray(value) && value.length > 0 && isFlatObjectArray(value)) {
    return arrayOfObjectsToTable(value as Record<string, unknown>[]);
  }

  return {
    markdown: "```json\n" + JSON.stringify(value, null, 2) + "\n```",
    format: "json",
    notes: [],
  };
}

function isFlatObjectArray(arr: unknown[]): boolean {
  return arr.every(
    (v) =>
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.values(v as Record<string, unknown>).every(
        (vv) =>
          vv === null ||
          typeof vv === "string" ||
          typeof vv === "number" ||
          typeof vv === "boolean"
      )
  );
}

function arrayOfObjectsToTable(arr: Record<string, unknown>[]): ConvertResult {
  // Preserve insertion order across the union of keys.
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const row of arr) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  const fmt = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string")
      return v.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    return String(v);
  };
  const lines = [
    `| ${keys.join(" | ")} |`,
    `| ${keys.map(() => "---").join(" | ")} |`,
    ...arr.map((row) => `| ${keys.map((k) => fmt(row[k])).join(" | ")} |`),
  ];
  return {
    markdown: lines.join("\n"),
    format: "json",
    notes: [`array of ${arr.length} objects → table (${keys.length} cols)`],
  };
}
