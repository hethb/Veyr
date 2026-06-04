import "dotenv/config";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import { openaiRouter } from "./routes/openai.js";
import { anthropicRouter } from "./routes/anthropic.js";
import { statsRouter } from "./routes/stats.js";
import { keysRouter } from "./routes/keys.js";
import { getOpenAIUpstreamUrl } from "./config.js";

const app = express();

// ---------------------------------------------------------------------------
// CORS
//   - /api/* must accept dashboard origins (configured via DASHBOARD_ORIGIN)
//   - /openai/* and /anthropic/* are server-to-server; permissive is fine
// ---------------------------------------------------------------------------
const dashboardOrigins = (process.env.DASHBOARD_ORIGIN ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: dashboardOrigins.length > 0 ? dashboardOrigins : true,
    credentials: true,
  })
);

// JSON body parsing. We need the parsed body for prompt-hash extraction and
// for forwarding upstream. 10MB is generous — adjust if needed.
app.use(express.json({ limit: "10mb" }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// TEMPORARY diagnostic — remove after debugging the Supabase connection.
app.get("/api/debug/supabase", async (_req: Request, res: Response) => {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const info: Record<string, unknown> = {
    supabaseUrl: url,
    urlHasRestPath: url.includes("/rest/v1"),
    urlHasTrailingSlash: url.endsWith("/"),
    serviceKeyLength: key.length,
    serviceKeyStart: key.slice(0, 12),
    serviceKeyEnd: key.slice(-6),
    serviceKeyHasWhitespace: /\s/.test(key),
  };
  try {
    const { getServiceClient } = await import("./utils/supabase.js");
    const supabase = getServiceClient();
    const { error } = await supabase.from("api_keys").select("id").limit(1);
    info.dbQuery = error ? `ERROR: ${error.message}` : "ok";
  } catch (err) {
    info.dbQuery = `THREW: ${err instanceof Error ? err.message : String(err)}`;
  }
  res.json(info);
});

app.use("/openai", openaiRouter);
app.use("/anthropic", anthropicRouter);
app.use("/api/stats", statsRouter);
app.use("/api/keys", keysRouter);

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler. Express 4 needs the 4-arg signature even if some args are unused.
const errorHandler: ErrorRequestHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error("[express] unhandled error:", err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
};
app.use(errorHandler);

const port = parseInt(process.env.PORT ?? "3001", 10);
app.listen(port, () => {
  console.log(`PromptLens proxy listening on :${port}`);
  console.log(`OpenAI-compatible upstream: ${getOpenAIUpstreamUrl()}`);
});
