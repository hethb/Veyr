import type { ConvertResult } from "./types.js";

/**
 * PDF → Markdown.
 *
 * Uses `pdf-parse` v2 (MIT) under the hood. The v2 API exposes a `PDFParse`
 * class that we instantiate per-document and dispose after use.
 *
 * The extracted text is post-processed with the same heuristics MarkItDown's
 * PDF converter applies: page boundaries become `<!-- page N -->` markers,
 * hyphenated line breaks are rejoined, and runs of whitespace collapsed.
 */
interface PDFParseInstance {
  getText(opts?: Record<string, unknown>): Promise<{
    text: string;
    pages?: Array<{ pageNumber?: number; text?: string }>;
    total?: number;
  }>;
  destroy(): Promise<void>;
}

interface PDFParseClass {
  new (opts: { data: Buffer | Uint8Array }): PDFParseInstance;
}

export async function convertPdf(buffer: Buffer): Promise<ConvertResult> {
  const mod = (await import("pdf-parse")) as unknown as {
    PDFParse?: PDFParseClass;
    default?: { PDFParse?: PDFParseClass };
  };
  const PDFParse = mod.PDFParse ?? mod.default?.PDFParse;
  if (!PDFParse) {
    throw new Error("pdf-parse: PDFParse class not found in module exports");
  }

  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();

    // Prefer the per-page array when available — it gives us reliable page
    // boundaries (the flat `text` field uses form-feeds inconsistently
    // across PDF generators).
    const pages = Array.isArray(result.pages) ? result.pages : null;
    let markdown: string;
    let pageCount: number;
    if (pages && pages.length > 0) {
      pageCount = pages.length;
      markdown = pages
        .map((p, idx) => {
          const cleaned = cleanText(p.text ?? "");
          const n = p.pageNumber ?? idx + 1;
          return cleaned ? `<!-- page ${n} -->\n${cleaned}` : "";
        })
        .filter((p) => p)
        .join("\n\n")
        .trim();
    } else {
      const flat = result.text ?? "";
      const chunks = flat.split(/\f/);
      pageCount = result.total ?? chunks.length;
      markdown = chunks
        .map((p, idx) => {
          const cleaned = cleanText(p);
          return cleaned ? `<!-- page ${idx + 1} -->\n${cleaned}` : "";
        })
        .filter((p) => p)
        .join("\n\n")
        .trim();
    }

    return {
      markdown,
      format: "pdf",
      notes: [`${pageCount} page${pageCount === 1 ? "" : "s"}`],
    };
  } finally {
    try {
      await parser.destroy();
    } catch {
      // best-effort; not fatal if cleanup fails
    }
  }
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    // Rejoin words hyphen-broken across lines: "exam-\nple" → "example".
    .replace(/(\w)-\n(\w)/g, "$1$2")
    // Treat single \n inside a paragraph as a space.
    .replace(/([^\n])\n(?!\n)/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
