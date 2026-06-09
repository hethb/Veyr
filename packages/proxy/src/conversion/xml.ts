import type { ConvertResult } from "./types.js";
import { decodeEntities } from "./html.js";

/**
 * XML → Markdown.
 *
 * Generic XML doesn't map cleanly onto Markdown structure, so we follow
 * MarkItDown's pragmatic approach: strip the markup, decode entities, keep
 * meaningful whitespace. The model receives the text content unbloated by
 * angle brackets — usually 60-80% fewer tokens than the raw document.
 */
export function convertXml(input: string): ConvertResult {
  // Remove comments, CDATA wrappers (but keep their content), processing
  // instructions, and tags.
  const stripped = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<\/?[^>]+>/g, " ");

  const text = decodeEntities(stripped)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    markdown: text,
    format: "xml",
    notes: ["markup stripped, entities decoded"],
  };
}
