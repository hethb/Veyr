import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  personalizedSuggest,
  recordPromptRevision,
  recordSuggestionEvent,
  type Exemplar,
  type PersonalizedSuggestResult,
  type PromptSeverity,
} from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";

const SEVERITY_BORDER: Record<PromptSeverity, string> = {
  high: "border-l-rose-400/70",
  medium: "border-l-amber-400/70",
  low: "border-l-sky-400/60",
};

const EXAMPLE =
  "fix the auth issue, also clean up the whole codebase and please make everything faster";

type Feedback = Record<string, "accepted" | "dismissed">;

export function PromptHelper() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<PersonalizedSuggestResult | null>(null);
  const [loading, setLoading] = useState(false);
  // Accept/dismiss state, keyed by suggestion id. Persists across re-analyses
  // (ids are stable) so editing the prompt doesn't wipe a click; cleared only
  // when the prompt is emptied.
  const [feedback, setFeedback] = useState<Feedback>({});
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!prompt.trim()) {
      setResult(null);
      setFeedback({});
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      try {
        setResult(await personalizedSuggest(prompt));
      } catch {
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [prompt]);

  function handleFeedback(id: string, action: "accepted" | "dismissed") {
    setFeedback((f) => ({ ...f, [id]: action }));
    void recordSuggestionEvent({ suggestion_id: id, action, prompt });
  }

  const acceptedIds = Object.entries(feedback)
    .filter(([, a]) => a === "accepted")
    .map(([id]) => id);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#7fa8ee]">
          Before you send
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Prompt Helper
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Paste the prompt you're about to give Claude Code (or any agent). We'll
          suggest cheaper, tighter phrasing before you spend the tokens.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="prompt" className="text-sm font-medium text-white">
              Your prompt
            </label>
            <button
              type="button"
              onClick={() => setPrompt(EXAMPLE)}
              className="text-xs font-medium text-[#7fa8ee] hover:text-[#b1c9ff]"
            >
              Try an example
            </button>
          </div>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. fix the auth middleware in src/auth.ts so the login test passes"
            className="h-72 w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-[#5b8def]/40 focus:outline-none"
          />
          {result && (
            <p className="mt-2 text-xs text-neutral-500">
              ~{result.token_estimate.toLocaleString()} tokens
            </p>
          )}
        </div>

        <div className="space-y-4">
          {result?.rewrite && (
            <RewritePanel
              rewrite={result.rewrite}
              onCopied={() =>
                void recordPromptRevision({
                  draft_prompt: prompt,
                  final_prompt: result.rewrite as string,
                  accepted_suggestion_ids: acceptedIds,
                })
              }
            />
          )}
          {result?.personalized && result.exemplars.length > 0 && (
            <ExemplarsPanel exemplars={result.exemplars} />
          )}
          {!prompt.trim() ? (
            <div className="rounded-lg border border-dashed border-white/[0.12] bg-white/[0.015] px-4 py-10 text-center text-sm text-neutral-500">
              Start typing to get suggestions.
            </div>
          ) : loading && !result ? (
            <div className="text-sm text-neutral-500">Analyzing…</div>
          ) : result && result.suggestions.length === 0 ? (
            <div className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-6 text-sm text-emerald-200">
              Looks tight — no obvious ways to cut tokens here.
            </div>
          ) : (
            result?.suggestions.map((s) => {
              const state = feedback[s.id];
              return (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-lg border border-white/[0.07] border-l-4 bg-white/[0.025] p-4 backdrop-blur-md transition-opacity",
                    SEVERITY_BORDER[s.severity],
                    state === "dismissed" && "opacity-50"
                  )}
                >
                  <h3 className="text-sm font-medium text-white">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                    {s.detail}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    {state ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium",
                          state === "accepted" ? "text-emerald-300" : "text-neutral-500"
                        )}
                      >
                        {state === "accepted" ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Marked helpful
                          </>
                        ) : (
                          <>
                            <X className="h-3.5 w-3.5" /> Dismissed
                          </>
                        )}
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleFeedback(s.id, "accepted")}
                          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/[0.06] px-2.5 py-1 text-xs font-medium text-emerald-200 hover:bg-emerald-400/[0.12]"
                        >
                          <Check className="h-3.5 w-3.5" /> Helpful
                        </button>
                        <button
                          type="button"
                          onClick={() => handleFeedback(s.id, "dismissed")}
                          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-neutral-400 hover:bg-white/[0.04]"
                        >
                          <X className="h-3.5 w-3.5" /> Dismiss
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {result && result.improved_template && (
            <ImprovedTemplate
              template={result.improved_template}
              onCopied={() =>
                void recordPromptRevision({
                  draft_prompt: prompt,
                  final_prompt: result.improved_template,
                  accepted_suggestion_ids: acceptedIds,
                })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RewritePanel({
  rewrite,
  onCopied,
}: {
  rewrite: string;
  onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyToClipboard(rewrite)) {
      setCopied(true);
      onCopied();
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.06]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-300">
          Personalized rewrite
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 hover:text-emerald-200"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-emerald-50/90">
        {rewrite}
      </pre>
    </div>
  );
}

function ExemplarsPanel({ exemplars }: { exemplars: Exemplar[] }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7fa8ee]">
        Based on your past prompts
      </p>
      <div className="mt-3 space-y-3">
        {exemplars.map((e, i) => (
          <div key={i} className="border-l-2 border-[#5b8def]/40 pl-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-neutral-500">
                You previously tightened a similar prompt
              </span>
              <span className="text-[11px] font-medium text-[#7fa8ee]">
                {Math.round(e.similarity * 100)}% match
              </span>
            </div>
            <p className="mt-1 font-mono text-xs leading-relaxed text-neutral-300">
              {e.final_preview}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImprovedTemplate({
  template,
  onCopied,
}: {
  template: string;
  onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyToClipboard(template)) {
      setCopied(true);
      onCopied();
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div className="rounded-lg border border-[#5b8def]/25 bg-[#5b8def]/[0.06]">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-[#7fa8ee]">
          Suggested structure
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 hover:text-[#9cc0ff]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#9cc0ff]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-neutral-300">
        {template}
      </pre>
    </div>
  );
}
