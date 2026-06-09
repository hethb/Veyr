import type { ConvertResult } from "./types.js";
import { convertHtml } from "./html.js";

/**
 * DOCX → Markdown.
 *
 * Uses `mammoth` (Apache-2.0) to lift the document into HTML, then reuses
 * our HTML→Markdown converter so heading levels, lists, and tables all come
 * through consistently with the rest of the pipeline.
 *
 * Like MarkItDown, we drop images by default — they don't help an LLM
 * unless you're also doing vision, and they 4x the token cost via base64.
 */
export async function convertDocx(buffer: Buffer): Promise<ConvertResult> {
  const mammoth = (await import("mammoth")) as {
    convertToHtml: (input: { buffer: Buffer }, opts?: Record<string, unknown>) => Promise<{
      value: string;
      messages: Array<{ type: string; message: string }>;
    }>;
  };

  const { value: html, messages } = await mammoth.convertToHtml(
    { buffer },
    { convertImage: () => Promise.resolve({ src: "" }) } // drop image data URIs
  );

  const inner = convertHtml(html);
  const notes = [...inner.notes];
  const warnings = messages.filter((m) => m.type === "warning").length;
  if (warnings > 0) notes.push(`${warnings} warning${warnings === 1 ? "" : "s"} from DOCX parser`);

  return {
    markdown: inner.markdown,
    format: "docx",
    notes,
  };
}
