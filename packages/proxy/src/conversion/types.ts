/**
 * Document → Markdown conversion. Canopy's pure-Node take on Microsoft's
 * MarkItDown (https://github.com/microsoft/markitdown, MIT) — same idea (turn
 * bloated formats into LLM-friendly Markdown), reimplemented in TypeScript so
 * it runs inside the existing proxy process without a Python dependency.
 *
 * Credit: the original MarkItDown project is © Microsoft Corporation and
 * released under the MIT license. See ATTRIBUTIONS.md at the repo root.
 */

export type SupportedFormat =
  | "pdf"
  | "docx"
  | "html"
  | "csv"
  | "tsv"
  | "json"
  | "xml"
  | "markdown"
  | "text";

export interface ConvertResult {
  /** The converted Markdown text. */
  markdown: string;
  /** The detected source format (post-sniffing). */
  format: SupportedFormat;
  /** Format-specific notes for the UI (e.g. "5 pages", "no tables found"). */
  notes: string[];
}

export interface ConverterContext {
  /** Original filename, if known. Used for hints only — never opened. */
  filename: string | null;
  /** MIME type the client claimed, if provided. */
  mime: string | null;
}
