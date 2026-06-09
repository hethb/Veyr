import { useCallback, useRef, useState } from "react";
import { Check, Copy, FileUp, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { convertDocument, type ConvertResult } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import { formatNumber, formatUsd } from "../lib/format";
import { Skeleton } from "../components/Skeleton";

const ACCEPT =
  ".pdf,.docx,.html,.htm,.csv,.tsv,.json,.xml,.svg,.md,.markdown,.txt,.log";

const MODEL_LABELS: Record<string, string> = {
  "gpt-4o-mini": "GPT-4o mini",
  "gpt-4o": "GPT-4o",
  "claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
};

export function Documents() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = useCallback(async (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const r = await convertDocument(f);
      setResult(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Conversion failed");
    } finally {
      setLoading(false);
    }
  }, []);

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#7fa8ee]">
          Before you send · Layer 2
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          Document → Markdown
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Convert PDFs, Word docs, HTML, CSV, JSON, and XML into compact,
          LLM-friendly Markdown — typically <span className="text-neutral-300">70–90%</span>{" "}
          fewer input tokens than raw extraction. Inspired by Microsoft's{" "}
          <a
            className="text-[#7fa8ee] hover:text-[#b1c9ff] underline-offset-4 hover:underline"
            href="https://github.com/microsoft/markitdown"
            target="_blank"
            rel="noreferrer noopener"
          >
            MarkItDown
          </a>{" "}
          (MIT). Pure-Node implementation — no file ever leaves the proxy.
        </p>
      </div>

      <label
        htmlFor="doc-upload"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
          dragOver
            ? "border-[#5b8def]/60 bg-[#5b8def]/[0.06]"
            : "border-white/[0.12] bg-white/[0.015] hover:border-white/[0.2] hover:bg-white/[0.03]"
        )}
      >
        <input
          ref={inputRef}
          id="doc-upload"
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = ""; // allow re-selecting same file
          }}
        />
        <div className="grid h-12 w-12 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[#9cc0ff]">
          <Upload className="h-5 w-5" />
        </div>
        <div className="mt-4 text-sm font-medium text-neutral-200">
          Drop a file here, or click to browse
        </div>
        <div className="mt-1 text-xs text-neutral-500">
          PDF · DOCX · HTML · CSV / TSV · JSON · XML · Markdown · text. Up to 20 MB.
        </div>
      </label>

      {error && (
        <div className="rounded-lg border border-rose-400/25 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      )}

      {result && file && !loading && (
        <ResultView file={file} result={result} />
      )}
    </div>
  );
}

interface ResultViewProps {
  file: File;
  result: ConvertResult;
}

function ResultView({ file, result }: ResultViewProps) {
  return (
    <>
      <section className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm">
              <FileUp className="h-4 w-4 text-neutral-500" />
              <span className="font-mono text-neutral-200 truncate">{file.name}</span>
              <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-400">
                {result.format}
              </span>
            </div>
            {result.notes.length > 0 && (
              <p className="mt-1 text-xs text-neutral-500">
                {result.notes.join(" · ")}
              </p>
            )}
          </div>
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
            −{result.savings_pct.toFixed(1)}% tokens
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="Original tokens"
            value={formatNumber(result.original_tokens)}
            subline={`${formatNumber(result.original_bytes)} bytes`}
          />
          <StatTile
            label="Markdown tokens"
            value={formatNumber(result.markdown_tokens)}
            subline={`${formatNumber(result.markdown_chars)} chars`}
            tone="positive"
          />
          <StatTile
            label="Tokens saved"
            value={formatNumber(result.tokens_saved)}
            subline="per call, every call"
            tone="positive"
          />
          <StatTile
            label="Saved on GPT-4o"
            value={formatUsd(
              result.cost_saved_per_call_usd["gpt-4o"] ?? 0,
              4
            )}
            subline="per call · see breakdown"
          />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-neutral-500">
              <tr className="border-b border-white/[0.07]">
                <th className="py-2 pr-4 font-medium uppercase tracking-wider">
                  Model
                </th>
                <th className="py-2 pr-4 font-medium uppercase tracking-wider tabular-nums">
                  Saved per call
                </th>
                <th className="py-2 pr-4 font-medium uppercase tracking-wider tabular-nums">
                  Saved per 1k calls
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.cost_saved_per_call_usd).map(
                ([model, perCall]) => (
                  <tr
                    key={model}
                    className="border-b border-white/[0.04] text-neutral-300"
                  >
                    <td className="py-2 pr-4 font-mono text-[12px]">
                      {MODEL_LABELS[model] ?? model}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-emerald-300">
                      {formatUsd(perCall, 6)}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-emerald-300">
                      {formatUsd(perCall * 1000, 2)}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      <MarkdownPreview markdown={result.markdown} />

      <CacheReadyPrompt
        markdown={result.markdown}
        filename={file.name}
      />
    </>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  subline: string;
  tone?: "positive" | "neutral";
}

function StatTile({ label, value, subline, tone = "neutral" }: StatTileProps) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "positive" ? "text-emerald-300" : "text-white"
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-neutral-500">{subline}</div>
    </div>
  );
}

function MarkdownPreview({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyToClipboard(markdown)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <section className="rounded-xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
          Markdown output
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-300 hover:text-[#9cc0ff]"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-[#9cc0ff]" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-[12.5px] leading-relaxed text-neutral-200">
        {markdown || "(empty)"}
      </pre>
    </section>
  );
}

function CacheReadyPrompt({
  markdown,
  filename,
}: {
  markdown: string;
  filename: string;
}) {
  const [copied, setCopied] = useState(false);
  // Cache-friendly ordering: stable context block FIRST, dynamic user
  // question LAST. Matches the same best practices the Prompt Helper enforces.
  const snippet = [
    "You are a helpful assistant. Use the document below as the source of truth.",
    "Cite specific sections where possible. If the answer is not in the document, say so.",
    "",
    `<document filename="${filename}">`,
    markdown,
    "</document>",
    "",
    "User question: <put the user's question here>",
  ].join("\n");

  async function copy() {
    if (await copyToClipboard(snippet)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <section className="rounded-xl border border-[#5b8def]/25 bg-[#5b8def]/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7fa8ee]">
            Cache-friendly system prompt
          </p>
          <p className="mt-1 text-sm text-neutral-400">
            Static document up top, dynamic user question last — primed for
            provider prompt caching (up to 90% input cost reduction on
            repeated calls).
          </p>
        </div>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#5b8def]/30 bg-[#5b8def]/10 px-3 py-1.5 text-xs font-medium text-[#9cc0ff] transition-colors hover:bg-[#5b8def]/20"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy snippet"}
        </button>
      </div>
    </section>
  );
}
