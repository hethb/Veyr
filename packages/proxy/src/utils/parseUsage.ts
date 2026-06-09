/**
 * Best-effort usage extractors for OpenAI and Anthropic responses.
 * Handles both standard JSON responses and SSE-streamed responses.
 *
 * If we can't parse usage we return zeros and let the caller decide whether
 * to mark the request as an error. We never throw — logging is fire-and-forget.
 */

export interface ParsedUsage {
  model: string | null;
  /**
   * Total input tokens billed (regular + cached + cache-creation). Normalized
   * so cost calculations and per-feature reporting stay provider-agnostic.
   *
   * Anthropic reports the three buckets separately and `input_tokens` does NOT
   * include cached/cache-creation tokens — we sum them here. OpenAI reports
   * the total and breaks out the cached portion in `prompt_tokens_details`.
   */
  promptTokens: number;
  completionTokens: number;
  /** Subset of promptTokens that came from a cache HIT (read). */
  cachedTokens: number;
  /** Subset of promptTokens that were WRITTEN to the cache this turn. */
  cacheCreationTokens: number;
  finishReason: string | null;
  errorMessage: string | null;
}

const EMPTY: ParsedUsage = {
  model: null,
  promptTokens: 0,
  completionTokens: 0,
  cachedTokens: 0,
  cacheCreationTokens: 0,
  finishReason: null,
  errorMessage: null,
};

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function tryJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function iterateSseEvents(body: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as unknown;
      const obj = asObject(parsed);
      if (obj) events.push(obj);
    } catch {
      // ignore malformed events
    }
  }
  return events;
}

/**
 * Parse an OpenAI chat completion response.
 */
export function parseOpenAI(
  contentType: string,
  body: string
): ParsedUsage {
  if (!body) return EMPTY;

  if (contentType.includes("application/json")) {
    const json = asObject(tryJson(body));
    if (!json) return EMPTY;

    if (asObject(json.error)) {
      return {
        ...EMPTY,
        model: asString(json.model),
        errorMessage: asString(asObject(json.error)?.message) ?? "OpenAI error",
      };
    }

    const usage = asObject(json.usage);
    const choices = Array.isArray(json.choices) ? json.choices : [];
    const firstChoice = asObject(choices[0]);
    const details = asObject(usage?.prompt_tokens_details);

    return {
      model: asString(json.model),
      promptTokens: asNumber(usage?.prompt_tokens),
      completionTokens: asNumber(usage?.completion_tokens),
      cachedTokens: asNumber(details?.cached_tokens),
      cacheCreationTokens: 0, // OpenAI doesn't bill cache creation explicitly.
      finishReason: asString(firstChoice?.finish_reason),
      errorMessage: null,
    };
  }

  if (contentType.includes("text/event-stream")) {
    let model: string | null = null;
    let promptTokens = 0;
    let completionTokens = 0;
    let cachedTokens = 0;
    let finishReason: string | null = null;

    for (const event of iterateSseEvents(body)) {
      if (!model) model = asString(event.model);
      const usage = asObject(event.usage);
      if (usage) {
        promptTokens = asNumber(usage.prompt_tokens) || promptTokens;
        completionTokens = asNumber(usage.completion_tokens) || completionTokens;
        const details = asObject(usage.prompt_tokens_details);
        if (details) cachedTokens = asNumber(details.cached_tokens) || cachedTokens;
      }
      const choices = Array.isArray(event.choices) ? event.choices : [];
      const firstChoice = asObject(choices[0]);
      const fr = asString(firstChoice?.finish_reason);
      if (fr) finishReason = fr;
    }

    return {
      model,
      promptTokens,
      completionTokens,
      cachedTokens,
      cacheCreationTokens: 0,
      finishReason,
      errorMessage: null,
    };
  }

  return EMPTY;
}

/**
 * Parse an Anthropic Messages API response.
 */
export function parseAnthropic(
  contentType: string,
  body: string
): ParsedUsage {
  if (!body) return EMPTY;

  if (contentType.includes("application/json")) {
    const json = asObject(tryJson(body));
    if (!json) return EMPTY;

    if (json.type === "error") {
      return {
        ...EMPTY,
        model: asString(json.model),
        errorMessage: asString(asObject(json.error)?.message) ?? "Anthropic error",
      };
    }

    const usage = asObject(json.usage);
    const cachedTokens = asNumber(usage?.cache_read_input_tokens);
    const cacheCreationTokens = asNumber(usage?.cache_creation_input_tokens);
    // Anthropic's `input_tokens` excludes cached + cache-creation tokens.
    // Sum them so downstream cost/aggregation sees the true input bill.
    const totalInput =
      asNumber(usage?.input_tokens) + cachedTokens + cacheCreationTokens;
    return {
      model: asString(json.model),
      promptTokens: totalInput,
      completionTokens: asNumber(usage?.output_tokens),
      cachedTokens,
      cacheCreationTokens,
      finishReason: asString(json.stop_reason),
      errorMessage: null,
    };
  }

  if (contentType.includes("text/event-stream")) {
    let model: string | null = null;
    let promptTokens = 0;
    let completionTokens = 0;
    let cachedTokens = 0;
    let cacheCreationTokens = 0;
    let finishReason: string | null = null;

    for (const event of iterateSseEvents(body)) {
      const type = asString(event.type);
      if (type === "message_start") {
        const message = asObject(event.message);
        if (message) {
          model = asString(message.model) ?? model;
          const usage = asObject(message.usage);
          if (usage) {
            const base = asNumber(usage.input_tokens);
            cachedTokens = asNumber(usage.cache_read_input_tokens);
            cacheCreationTokens = asNumber(usage.cache_creation_input_tokens);
            promptTokens = base + cachedTokens + cacheCreationTokens;
          }
        }
      } else if (type === "message_delta") {
        const usage = asObject(event.usage);
        if (usage) {
          completionTokens = asNumber(usage.output_tokens) || completionTokens;
        }
        const delta = asObject(event.delta);
        const fr = asString(delta?.stop_reason);
        if (fr) finishReason = fr;
      }
    }

    return {
      model,
      promptTokens,
      completionTokens,
      cachedTokens,
      cacheCreationTokens,
      finishReason,
      errorMessage: null,
    };
  }

  return EMPTY;
}

/**
 * Extracts a SHA-256-able representation of the system prompt from an
 * incoming OpenAI-style request body. Returns empty string if no system
 * message is present.
 */
export function extractOpenAISystemPrompt(body: unknown): string {
  const obj = asObject(body);
  if (!obj) return "";
  const messages = Array.isArray(obj.messages) ? obj.messages : [];
  for (const m of messages) {
    const msg = asObject(m);
    if (msg?.role === "system" && typeof msg.content === "string") {
      return msg.content;
    }
    if (msg?.role === "system" && Array.isArray(msg.content)) {
      return msg.content
        .map((p) => {
          const part = asObject(p);
          return typeof part?.text === "string" ? part.text : "";
        })
        .join("");
    }
  }
  return "";
}

/**
 * Anthropic puts the system prompt in a top-level `system` field.
 * It can be a string OR an array of content blocks.
 */
export function extractAnthropicSystemPrompt(body: unknown): string {
  const obj = asObject(body);
  if (!obj) return "";
  const sys = obj.system;
  if (typeof sys === "string") return sys;
  if (Array.isArray(sys)) {
    return sys
      .map((p) => {
        const part = asObject(p);
        return typeof part?.text === "string" ? part.text : "";
      })
      .join("");
  }
  return "";
}
