import type { Request, Response } from "express";

/**
 * Hop-by-hop headers we should not forward verbatim, plus a few headers we
 * need to control ourselves (host, connection, content-length).
 *
 * https://www.rfc-editor.org/rfc/rfc7230#section-6.1
 */
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "x-promptlens-key",
  "x-feature-tag",
  "x-request-path",
]);

const STRIP_RESPONSE_HEADERS = new Set([
  "transfer-encoding",
  "connection",
  "keep-alive",
  "content-length",
]);

export interface ForwardResult {
  /** Wall-clock latency in milliseconds. */
  latencyMs: number;
  /** Raw response body assembled from streamed chunks. */
  body: string;
  /** Upstream HTTP status. */
  status: number;
  /** Whether upstream returned a 2xx response. */
  ok: boolean;
  /** Detected upstream Content-Type, lowercased. */
  contentType: string;
}

/**
 * Forwards an incoming request to `targetUrl`, streams the response back to
 * the client transparently, and returns the captured body for logging.
 *
 * `headerOverrides` lets callers swap in provider-specific auth headers
 * (e.g. pass through Authorization for OpenAI or x-api-key for Anthropic).
 */
export async function forwardAndCapture(
  req: Request,
  res: Response,
  targetUrl: string
): Promise<ForwardResult> {
  const startedAt = Date.now();

  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (STRIP_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }

  const body = req.body !== undefined ? JSON.stringify(req.body) : undefined;
  if (body !== undefined && !headers["content-type"]) {
    headers["content-type"] = "application/json";
  }

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body,
  });

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    res.setHeader(key, value);
  });

  const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
  const chunks: Uint8Array[] = [];
  const reader = upstream.body?.getReader();

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        res.write(Buffer.from(value));
      }
    }
  }
  res.end();

  return {
    latencyMs: Date.now() - startedAt,
    body: Buffer.concat(chunks).toString("utf8"),
    status: upstream.status,
    ok: upstream.ok,
    contentType,
  };
}
