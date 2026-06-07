import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Skeleton";
import {
  getSuggestions,
  previewCompression,
  type CompressionPreview,
  type Suggestion,
  type SuggestionCategory,
  type SuggestionSeverity,
} from "../lib/api";
import { formatUsd } from "../lib/format";

const DISMISSED_KEY = "promptlens:dismissed-suggestions";

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage unavailable — dismissals just won't persist.
  }
}

const SEVERITY_BORDER: Record<SuggestionSeverity, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-[#4FABFF]",
};

const CATEGORY_LABEL: Record<SuggestionCategory, string> = {
  model: "model",
  "token-waste": "token-waste",
  session: "session",
  caching: "caching",
  volume: "volume",
};

export function SuggestionsPanel() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  useEffect(() => {
    let cancel = false;
    getSuggestions()
      .then((d) => {
        if (!cancel) setSuggestions(d);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const visible = useMemo(
    () => (suggestions ?? []).filter((s) => !dismissed.has(s.id)),
    [suggestions, dismissed]
  );

  const totalImpact = useMemo(
    () => visible.reduce((sum, s) => sum + s.impact_usd, 0),
    [visible]
  );

  function dismiss(id: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
  }

  // Fetch failed: hide the section entirely (don't break the page).
  if (failed) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-white">Optimization suggestions</h2>
        {suggestions === null ? (
          <p className="mt-1 text-sm text-neutral-500">Analyzing your usage…</p>
        ) : visible.length === 0 ? null : (
          <p className="mt-1 text-sm text-neutral-400">
            We found {visible.length}{" "}
            {visible.length === 1 ? "way" : "ways"} to reduce your spend by an
            estimated{" "}
            <span className="font-semibold text-emerald-400">
              {formatUsd(totalImpact, 2)}/month
            </span>
            .
          </p>
        )}
      </div>

      {suggestions === null ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-dashed border-white/15 bg-black/40 px-4 py-8 text-center text-sm text-neutral-500">
          No suggestions yet — keep sending traffic and we'll analyze your patterns.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <SuggestionCard key={s.id} suggestion={s} onDismiss={() => dismiss(s.id)} />
          ))}
        </div>
      )}
    </section>
  );
}

interface CardProps {
  suggestion: Suggestion;
  onDismiss: () => void;
}

function SuggestionCard({ suggestion: s, onDismiss }: CardProps) {
  const canPreview = s.id.startsWith("redundant-prompt-template");
  const promptHash =
    typeof s.evidence.prompt_hash_prefix === "string"
      ? s.evidence.prompt_hash_prefix
      : null;

  return (
    <div
      className={cn(
        "border border-white/10 border-l-4 bg-black/65 p-4 backdrop-blur-md",
        SEVERITY_BORDER[s.severity]
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            {CATEGORY_LABEL[s.category]}
          </span>
          {s.quick_win && (
            <span className="border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
              Quick win
            </span>
          )}
          {s.impact_usd > 0 && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
              Save ~{formatUsd(s.impact_usd, 2)}/mo
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-300"
        >
          Dismiss
        </button>
      </div>

      <h3 className="mt-3 text-sm font-medium text-white">{s.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-neutral-400">{s.description}</p>

      <div className="mt-3 border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-neutral-400">
        <span className="font-medium text-neutral-300">Action: </span>
        {s.action}
      </div>

      {canPreview && promptHash && <CompressionPreviewBlock promptHash={promptHash} />}
    </div>
  );
}

function CompressionPreviewBlock({ promptHash }: { promptHash: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompressionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (result || error) return;
    setLoading(true);
    try {
      const r = await previewCompression(promptHash);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compression preview failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void run()}
        className="border border-[#076EFF]/40 bg-[#076EFF]/10 px-3 py-1.5 text-xs font-medium text-[#4FABFF] transition-colors hover:bg-[#076EFF]/20"
      >
        {open ? "Hide compression preview" : "Preview compression"}
      </button>

      {open && (
        <div className="mt-3 border border-white/10 bg-black/50 p-3 text-xs">
          {loading ? (
            <Skeleton className="h-16 w-full" />
          ) : error ? (
            <p className="text-neutral-400">{error}</p>
          ) : result ? (
            <CompressionResultView result={result} />
          ) : null}
        </div>
      )}
    </div>
  );
}

function CompressionResultView({ result }: { result: CompressionPreview }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-neutral-400">
        <span>
          Original:{" "}
          <span className="font-mono text-neutral-300">{result.original_tokens}</span> tokens
        </span>
        <span>→</span>
        <span>
          Compressed:{" "}
          <span className="font-mono text-emerald-300">{result.compressed_tokens}</span> tokens
        </span>
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-emerald-300">
          -{result.pct_reduction}%
        </span>
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap border border-white/10 bg-neutral-950 p-2 font-mono text-[11px] leading-relaxed text-neutral-300">
        {result.compressed_prompt}
      </pre>
    </div>
  );
}
