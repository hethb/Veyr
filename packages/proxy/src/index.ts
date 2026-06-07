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

app.use("/openai", openaiRouter);
app.use("/anthropic", anthropicRouter);
app.use("/api/stats", statsRouter);
app.use("/api/keys", keysRouter);
app.use("/api/policies", policiesRouter);
app.use("/api/analysis", analysisRouter);

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
});
