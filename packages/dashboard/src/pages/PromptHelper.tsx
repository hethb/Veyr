import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { lintPrompt, type PromptLintResult, type PromptSeverity } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";

const SEVERITY_BORDER: Record<PromptSeverity, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-[#4FABFF]",
};

const EXAMPLE =
  "fix the auth issue, also clean up the whole codebase and please make everything faster";

export function PromptHelper() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<PromptLintResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (!prompt.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    timer.current = window.setTimeout(async () => {
      try {
        setResult(await lintPrompt(prompt));
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

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
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
              className="text-xs font-medium text-[#4FABFF] hover:text-[#B1C5FF]"
            >
              Try an example
            </button>
          </div>
          <textarea
            id="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. fix the auth middleware in src/auth.ts so the login test passes"
            className="h-72 w-full resize-none border border-white/10 bg-black/65 p-4 font-mono text-sm text-white placeholder:text-neutral-600 focus:border-[#4FABFF]/50 focus:outline-none"
          />
          {result && (
            <p className="mt-2 text-xs text-neutral-500">
              ~{result.token_estimate.toLocaleString()} tokens
            </p>
          )}
        </div>

        <div className="space-y-4">
          {!prompt.trim() ? (
            <div className="border border-dashed border-white/15 bg-black/40 px-4 py-10 text-center text-sm text-neutral-500">
              Start typing to get suggestions.
            </div>
          ) : loading && !result ? (
            <div className="text-sm text-neutral-500">Analyzing…</div>
          ) : result && result.suggestions.length === 0 ? (
            <div className="border border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-200">
              Looks tight — no obvious ways to cut tokens here.
            </div>
          ) : (
            result?.suggestions.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "border border-white/10 border-l-4 bg-black/65 p-4",
                  SEVERITY_BORDER[s.severity]
                )}
              >
                <h3 className="text-sm font-medium text-white">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-neutral-400">
                  {s.detail}
                </p>
              </div>
            ))
          )}

          {result && result.improved_template && (
            <ImprovedTemplate template={result.improved_template} />
          )}
        </div>
      </div>
    </div>
  );
}

function ImprovedTemplate({ template }: { template: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyToClipboard(template)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div className="border border-[#076EFF]/30 bg-[#076EFF]/[0.06]">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-[#4FABFF]">
          Suggested structure
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 hover:text-[#4FABFF]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#4FABFF]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-neutral-300">
        {template}
      </pre>
    </div>
  );
}
