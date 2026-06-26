const DEFAULT_OPENAI_UPSTREAM =
  "https://api.openai.com/v1/chat/completions";

/** OpenAI-compatible chat completions endpoint (OpenAI, Groq, Ollama, etc.) */
export function getOpenAIUpstreamUrl(): string {
  return (
    process.env.OPENAI_UPSTREAM_URL?.trim() || DEFAULT_OPENAI_UPSTREAM
  );
}

/** When true, compress system/user prompts unless x-promptlens-compress: 0 */
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
