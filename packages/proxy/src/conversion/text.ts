import type { ConvertResult } from "./types.js";

/**
 * Plain-text passthrough. Normalises CRLF, strips trailing whitespace,
 * collapses runs of blank lines to a maximum of two — the same kind of
 * "least surprising" cleanup MarkItDown applies as a baseline.
 */
export function convertText(input: string): ConvertResult {
  const md = input
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    markdown: md,
    format: "text",
    notes: [],
  };
}
