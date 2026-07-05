/**
 * Conversation trimming for long multi-turn requests (Part 7).
 *
 * Three strategies, chosen by config/complexity. The system prompt is never
 * trimmed. Trimming only triggers past a per-complexity message threshold
 * (simple 15, moderate 25, complex 40).
 */
import { estimateTokens } from "./compress.js";
import type { TaskComplexity } from "./complexity.js";

export type TrimStrategy = "last_n" | "summarize" | "key_points_only";

export interface Message {
  role: string;
  content: unknown;
}

export interface TrimConfig {
  strategy: TrimStrategy;
  lastN: number;
  /** Anthropic key for the `summarize` strategy; falls back to last_n without one. */
  anthropicApiKey?: string | null;
}

export interface TrimResult {
  trimmed: Message[];
  tokensSaved: number;
  strategy: TrimStrategy;
  messagesDropped: number;
}

const TRIGGER_BY_COMPLEXITY: Record<TaskComplexity, number> = {
  simple: 15,
  moderate: 25,
  complex: 40,
};

const KEY_POINT_RE =
  /\.(ts|js|py|swift|go|rs|json|md)\b|error|Error|exception|Exception|failed|Failed|decided|decision|will|won't|should|must|TODO|FIXME/;

function contentText(message: Message): string {
  return typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content ?? "");
}

function totalTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(contentText(m)), 0);
}

export class ConversationTrimmer {
  constructor(private readonly config: TrimConfig) {}

  shouldTrim(messages: Message[], complexity: TaskComplexity): boolean {
    return messages.length > TRIGGER_BY_COMPLEXITY[complexity];
  }

  async trim(
    messages: Message[],
    complexity: TaskComplexity
  ): Promise<TrimResult> {
    if (!this.shouldTrim(messages, complexity)) {
      return { trimmed: messages, tokensSaved: 0, strategy: this.config.strategy, messagesDropped: 0 };
    }

    // System messages are never trimmed, wherever they appear.
    const systemMessages = messages.filter((m) => m.role === "system");
    const conversational = messages.filter((m) => m.role !== "system");
    const before = totalTokens(messages);

    let kept: Message[];
    let strategy = this.config.strategy;

    switch (strategy) {
      case "key_points_only": {
        kept = conversational.filter((m) => KEY_POINT_RE.test(contentText(m)));
        // Always keep the last exchange so the model sees the live question.
        for (const m of conversational.slice(-2)) {
          if (!kept.includes(m)) kept.push(m);
        }
        break;
      }
      case "summarize": {
        const dropped = conversational.slice(0, -this.config.lastN);
        const tail = conversational.slice(-this.config.lastN);
        if (dropped.length === 0) {
          kept = tail;
          break;
        }
        const summary = await this.summarizeDroppedMessages(dropped);
        if (summary === null) {
          // No key or call failed — degrade to last_n.
          strategy = "last_n";
          kept = [
            { role: "user", content: `[Veyr: earlier conversation trimmed. Last ${this.config.lastN} messages shown.]` },
            ...tail,
          ];
        } else {
          kept = [{ role: "user", content: `[Context — earlier conversation summary] ${summary}` }, ...tail];
        }
        break;
      }
      case "last_n":
      default: {
        const tail = conversational.slice(-this.config.lastN);
        kept =
          conversational.length > tail.length
            ? [
                { role: "user", content: `[Veyr: earlier conversation trimmed. Last ${this.config.lastN} messages shown.]` },
                ...tail,
              ]
            : tail;
        break;
      }
    }

    const trimmed = [...systemMessages, ...kept];
    const after = totalTokens(trimmed);
    return {
      trimmed,
      tokensSaved: Math.max(0, before - after),
      strategy,
      messagesDropped: Math.max(0, messages.length - trimmed.length),
    };
  }

  /** Haiku summarization with a cached system prompt; null on any failure. */
  private async summarizeDroppedMessages(dropped: Message[]): Promise<string | null> {
    const key = this.config.anthropicApiKey;
    if (!key) return null;
    try {
      const transcript = dropped
        .map((m) => `${m.role}: ${contentText(m).slice(0, 500)}`)
        .join("\n")
        .slice(0, 8000);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 250,
          system: [
            {
              type: "text",
              text: "Summarize the following conversation history in under 150 words, preserving key decisions, file names, and unresolved issues.",
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: transcript }],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      const text = data.content?.find((b) => b.type === "text")?.text;
      return text?.trim() || null;
    } catch {
      return null;
    }
  }
}
