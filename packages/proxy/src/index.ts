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
import { policiesRouter } from "./routes/policies.js";
import { analysisRouter } from "./routes/analysis.js";
import { convertRouter } from "./routes/convert.js";
import { dashboardAuth } from "./middleware/dashboardAuth.js";
import { getOpenAIUpstreamUrl, isAuthEnabled } from "./config.js";

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
// for forwarding upstream. Bumped to 30MB so the /api/convert endpoint can
// accept base64-encoded files up to ~20MB (base64 inflates by ~33%).
app.use(express.json({ limit: "30mb" }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/openai", openaiRouter);
app.use("/anthropic", anthropicRouter);
// dashboardAuth is a pass-through unless AUTH_ENABLED=true, in which case it
// requires a Supabase token and scopes each request to req.userId.
app.use("/api/stats", dashboardAuth, statsRouter);
app.use("/api/keys", dashboardAuth, keysRouter);
app.use("/api/policies", dashboardAuth, policiesRouter);
app.use("/api/analysis", dashboardAuth, analysisRouter);
app.use("/api/convert", dashboardAuth, convertRouter);

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
  console.log(
    `Control plane: compression default=${process.env.ENABLE_COMPRESSION === "true" ? "on" : "off"}`
  );
  console.log(
    `Auth: ${isAuthEnabled() ? "enabled (multi-tenant, Supabase)" : "disabled (local single-tenant)"}`
  );
});
