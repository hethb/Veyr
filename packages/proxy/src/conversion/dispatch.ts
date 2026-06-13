import { convertCsv } from "./csv.js";
import { convertDocx } from "./docx.js";
import { convertHtml } from "./html.js";
import { convertJson } from "./json.js";
import { convertPdf } from "./pdf.js";
import { convertText } from "./text.js";
import { convertXml } from "./xml.js";
import type { ConverterContext, ConvertResult, SupportedFormat } from "./types.js";

const PDF_MAGIC = "%PDF-";
const DOCX_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // ZIP local file header

function looksLikePdf(buf: Buffer): boolean {
  return buf.slice(0, 5).toString("ascii") === PDF_MAGIC;
}

function looksLikeZip(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  return DOCX_MAGIC.every((b, i) => buf[i] === b);
}

function looksLikeHtml(text: string): boolean {
  const sample = text.slice(0, 4096).toLowerCase();
  return /<!doctype html|<html[\s>]|<body[\s>]/.test(sample);
}

function looksLikeXml(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed.startsWith("<?xml") || /^<[a-zA-Z][^>]*>/.test(trimmed);
}

function looksLikeJson(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  const first = t[0];
  if (first !== "{" && first !== "[") return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}

function looksLikeCsv(text: string): { ok: boolean; delimiter: "," | "\t" } {
  const lines = text.split(/\r?\n/).slice(0, 5).filter((l) => l.length > 0);
  if (lines.length < 2) return { ok: false, delimiter: "," };
  const commaCounts = lines.map((l) => (l.match(/,/g) || []).length);
  const tabCounts = lines.map((l) => (l.match(/\t/g) || []).length);
  const sameCommas = commaCounts.every((c) => c === commaCounts[0]) && commaCounts[0] > 0;
  const sameTabs = tabCounts.every((c) => c === tabCounts[0]) && tabCounts[0] > 0;
  if (sameTabs && tabCounts[0] >= commaCounts[0]) return { ok: true, delimiter: "\t" };
  if (sameCommas) return { ok: true, delimiter: "," };
  return { ok: false, delimiter: "," };
}

function extensionFormat(filename: string | null): SupportedFormat | null {
  if (!filename) return null;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf": return "pdf";
    case "docx": return "docx";
    case "htm":
    case "html": return "html";
    case "csv": return "csv";
    case "tsv": return "tsv";
    case "json": return "json";
    case "xml":
    case "svg": return "xml";
    case "md":
    case "markdown": return "markdown";
    case "txt":
    case "log":
    case "text": return "text";
    default: return null;
  }
}

function mimeFormat(mime: string | null): SupportedFormat | null {
  if (!mime) return null;
  const m = mime.toLowerCase().split(";")[0].trim();
  if (m === "application/pdf") return "pdf";
  if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    return "docx";
  if (m === "text/html" || m === "application/xhtml+xml") return "html";
  if (m === "text/csv") return "csv";
  if (m === "text/tab-separated-values") return "tsv";
  if (m === "application/json" || m === "application/ld+json") return "json";
  if (m === "application/xml" || m === "text/xml" || m === "image/svg+xml")
    return "xml";
  if (m === "text/markdown") return "markdown";
  if (m.startsWith("text/")) return "text";
  return null;
}

/**
 * Dispatches to the right converter based on (1) MIME hint, (2) filename
 * extension, (3) content sniffing. Binary formats (PDF/DOCX) take priority
 * via magic-number sniffing so a misnamed extension can't masquerade.
 */
export async function dispatch(
  buffer: Buffer,
  context: ConverterContext
): Promise<ConvertResult> {
  // 1. Binary sniff wins outright — we can't try to read PDF as text.
  if (looksLikePdf(buffer)) return convertPdf(buffer);
  if (looksLikeZip(buffer)) {
    // ZIP container — could be DOCX, XLSX, PPTX, generic. We currently only
    // ship a DOCX converter; for the others, return a helpful error.
    const hinted = mimeFormat(context.mime) ?? extensionFormat(context.filename);
    if (hinted === "docx") return convertDocx(buffer);
    throw new Error(
      "Unsupported ZIP-based format. Veyr currently supports DOCX " +
        "(.docx). PPTX/XLSX support is on the roadmap."
    );
  }

  // 2. Decode as UTF-8 and sniff the textual format.
  const text = buffer.toString("utf8");
  const hinted = mimeFormat(context.mime) ?? extensionFormat(context.filename);

  if (hinted === "html") return convertHtml(text);
  if (hinted === "csv") return convertCsv(text, ",");
  if (hinted === "tsv") return convertCsv(text, "\t");
  if (hinted === "json") return convertJson(text);
  if (hinted === "xml") return convertXml(text);
  if (hinted === "markdown") return { ...convertText(text), format: "markdown" };
  if (hinted === "text") return convertText(text);

  // 3. No reliable hint — sniff content. Order matters: JSON/HTML before XML
  //    since both can start with `<`/`{` ambiguously.
  if (looksLikeJson(text)) return convertJson(text);
  if (looksLikeHtml(text)) return convertHtml(text);
  if (looksLikeXml(text)) return convertXml(text);
  const csv = looksLikeCsv(text);
  if (csv.ok) return convertCsv(text, csv.delimiter);

  return convertText(text);
}
