const DEFAULT_OPENAI_UPSTREAM =
  "https://api.openai.com/v1/chat/completions";

/** OpenAI-compatible chat completions endpoint (OpenAI, Groq, Ollama, etc.) */
export function getOpenAIUpstreamUrl(): string {
  return (
    process.env.OPENAI_UPSTREAM_URL?.trim() || DEFAULT_OPENAI_UPSTREAM
  );
}
