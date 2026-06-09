import type { ConvertResult } from "./types.js";

/**
 * Minimal RFC 4180 CSV parser — handles quoted fields, embedded commas, and
 * doubled-quote escapes. Falls back gracefully on malformed input rather
 * than throwing. We deliberately don't depend on a CSV library; the parser
 * is ~40 lines and ships in the proxy process.
 */
function parseDelimited(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.length > 0));
}

function escapeCell(s: string): string {
  // Pipe and newline are the only Markdown-table-breaking characters.
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function convertCsv(input: string, delimiter: "," | "\t"): ConvertResult {
  const rows = parseDelimited(input, delimiter);
  if (rows.length === 0) {
    return { markdown: "", format: delimiter === "\t" ? "tsv" : "csv", notes: ["empty"] };
  }
  const width = Math.max(...rows.map((r) => r.length));
  // Pad rows so the Markdown table stays well-formed.
  const padded = rows.map((r) => {
    const copy = [...r];
    while (copy.length < width) copy.push("");
    return copy.map(escapeCell);
  });
  const [header, ...body] = padded;
  const sep = header.map(() => "---");
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ];
  return {
    markdown: lines.join("\n"),
    format: delimiter === "\t" ? "tsv" : "csv",
    notes: [`${body.length} rows × ${width} cols`],
  };
}
