const DEFAULT_OPENAI_UPSTREAM =
  "https://api.openai.com/v1/chat/completions";

/** OpenAI-compatible chat completions endpoint (OpenAI, Groq, Ollama, etc.) */
export function getOpenAIUpstreamUrl(): string {
  return (
    process.env.OPENAI_UPSTREAM_URL?.trim() || DEFAULT_OPENAI_UPSTREAM
  );
}

/** When true, compress system/user prompts unless x-veyr-compress: 0 */
export function isCompressionEnabledByDefault(): boolean {
  return process.env.ENABLE_COMPRESSION === "true";
}

/**
 * When true, raw prompt text may be persisted (e.g. prompt_revisions draft/final
 * pairs for personalization). Off by default — Veyr is privacy-first and stores
 * only hashes + metadata unless a deployment explicitly opts in.
 */
export function isRawPromptStorageEnabled(): boolean {
  return process.env.STORE_PROMPTS === "true";
}

/**
 * When true, the personalization endpoint may call an LLM to generate a concrete
 * rewrite from the user's exemplars. Off by default: it sends prompt text to the
 * configured upstream, so it is opt-in independent of retrieval (which is local).
 */
export function isPromptRewriteEnabled(): boolean {
  return process.env.ENABLE_PROMPT_REWRITE === "true";
}

/** Model used for personalized rewrites. */
export function getRewriteModel(): string {
  return process.env.REWRITE_MODEL?.trim() || "gpt-4o-mini";
}

/** API key for the rewrite call; falls back to the proxy's default upstream key. */
export function getRewriteApiKey(): string {
  return (
    process.env.REWRITE_API_KEY?.trim() ||
    process.env.GROQ_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}

/**
 * When true, dashboard API routes require a Supabase access token and data is
 * scoped per-user (multi-tenant). When false (default), the proxy is the
 * zero-config single-tenant local tool.
 */
export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === "true";
}

/** Supabase project URL (no trailing slash), used to verify access tokens. */
export function getSupabaseUrl(): string {
  return (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
}

/** Supabase anon (public) key — sent as the `apikey` header when verifying. */
export function getSupabaseAnonKey(): string {
  return (process.env.SUPABASE_ANON_KEY ?? "").trim();
}
