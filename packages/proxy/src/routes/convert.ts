import { Router, type Request, type Response } from "express";
import { dispatch } from "../conversion/dispatch.js";
import { inputCostPerToken } from "../utils/costs.js";

export const convertRouter: Router = Router();

/** 4-char-per-token estimator; matches the prompt-lint heuristic. */
function estimateTokens(text: string): number {
  return text ? Math.ceil(text.length / 4) : 0;
}

/** Common LLM input prices the panel surfaces in the savings breakdown. */
const PRICED_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3-5-sonnet-20241022",
];

// ---------------------------------------------------------------------------
// POST /api/convert
//
// Body: { filename?: string, mime?: string, data_b64: string }
// Returns the converted Markdown plus token / cost savings estimates.
// ---------------------------------------------------------------------------
convertRouter.post("/", async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as {
    filename?: unknown;
    mime?: unknown;
    data_b64?: unknown;
  };

  const filename = typeof body.filename === "string" ? body.filename : null;
  const mime = typeof body.mime === "string" ? body.mime : null;
  const dataB64 = typeof body.data_b64 === "string" ? body.data_b64 : "";

  if (!dataB64) {
    res.status(400).json({ error: "data_b64 required (base64-encoded file content)" });
    return;
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(dataB64, "base64");
  } catch {
    res.status(400).json({ error: "Invalid base64 payload" });
    return;
  }

  // Cap at 20MB of decoded content — converters allocate the full string in
  // memory; very large PDFs are best handled out-of-band.
  const MAX_BYTES = 20 * 1024 * 1024;
  if (buffer.length > MAX_BYTES) {
    res
      .status(413)
      .json({ error: `File too large (${buffer.length} bytes; max ${MAX_BYTES}).` });
    return;
  }
  if (buffer.length === 0) {
    res.status(400).json({ error: "Empty file" });
    return;
  }

  try {
    const result = await dispatch(buffer, { filename, mime });

    const originalChars = buffer.length; // text size for text, byte size for binary
    const originalText =
      result.format === "pdf" || result.format === "docx"
        ? null
        : buffer.toString("utf8");
    // For binary formats we estimate "what you'd send to an LLM today" as the
    // raw byte count — that's roughly what naive `pdf.toString()` extraction
    // gives, and customers usually quote the file size.
    const originalTokens = originalText
      ? estimateTokens(originalText)
      : Math.ceil(originalChars / 4);
    const markdownTokens = estimateTokens(result.markdown);
    const tokensSaved = Math.max(0, originalTokens - markdownTokens);
    const savingsPct =
      originalTokens > 0
        ? Math.round((tokensSaved / originalTokens) * 1000) / 10
        : 0;

    const costSavedByModel: Record<string, number> = {};
    for (const model of PRICED_MODELS) {
      const perTok = inputCostPerToken(model);
      costSavedByModel[model] = Math.round(tokensSaved * perTok * 1e6) / 1e6;
    }

    res.json({
      format: result.format,
      notes: result.notes,
      markdown: result.markdown,
      original_bytes: buffer.length,
      original_tokens: originalTokens,
      markdown_chars: result.markdown.length,
      markdown_tokens: markdownTokens,
      tokens_saved: tokensSaved,
      savings_pct: savingsPct,
      cost_saved_per_call_usd: costSavedByModel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Conversion failed";
    console.error("[convert] failed:", err);
    // Map "Unsupported …" errors to 415 so the UI can show a clean message.
    if (message.startsWith("Unsupported")) {
      res.status(415).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Conversion failed: " + message });
  }
});
