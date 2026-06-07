import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowRight, Check, Copy } from "lucide-react";
import { authEnabled, supabase } from "../lib/auth";
import { createKey, listKeys } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";

type Phase = "loading" | "no-session" | "ready" | "error";

export function Welcome() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [keyPrefix, setKeyPrefix] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authEnabled || !supabase) return;
    let cancelled = false;

    async function provision() {
      try {
        const existing = await listKeys();
        if (cancelled) return;
        if (existing.length > 0) {
          // A key already exists — we can't reveal its secret again.
          setKeyPrefix(existing[0].key_prefix);
          setPhase("ready");
          return;
        }
        const created = await createKey("Default");
        if (cancelled) return;
        setApiKey(created.key);
        setKeyPrefix(created.key_prefix);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to set up your account");
        setPhase("error");
      }
    }

    // The magic-link session may still be resolving from the URL hash.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) {
        provision();
      } else {
        setPhase("no-session");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session) provision();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!authEnabled) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-black px-6 py-20 text-white">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center border border-[#076EFF] bg-black text-sm font-bold text-[#4FABFF]">
            PL
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to PromptLens</h1>
        </div>

        {phase === "loading" && (
          <p className="text-sm text-neutral-400">Setting up your account…</p>
        )}

        {phase === "no-session" && (
          <div className="border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-200">
            We couldn't find an active session. Open the magic link from your
            email on this device, or{" "}
            <Link to="/" className="underline">
              request a new one
            </Link>
            .
          </div>
        )}

        {phase === "error" && (
          <div className="border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {phase === "ready" && (
          <div className="space-y-8">
            {apiKey ? (
              <ApiKeyBlock apiKey={apiKey} />
            ) : (
              <div className="border border-white/10 bg-white/[0.02] px-5 py-4 text-sm text-neutral-400">
                You already have an API key (
                <span className="font-mono text-neutral-300">{keyPrefix}…</span>).
                For security we can only show the full secret once — create a new
                one on the{" "}
                <Link to="/keys" className="text-[#4FABFF] underline">
                  API Keys
                </Link>{" "}
                page if you've lost it.
              </div>
            )}

            <IntegrationSnippet apiKey={apiKey ?? "pl_live_…"} />

            <p className="text-sm text-neutral-500">
              Once you make your first API call, your dashboard will populate
              automatically.
            </p>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 border border-white bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
            >
              Go to dashboard
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function ApiKeyBlock({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyToClipboard(apiKey)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
        Your API key
      </p>
      <div className="flex items-center gap-2 border border-white/15 bg-neutral-950 px-4 py-3">
        <code className="flex-1 overflow-x-auto font-mono text-sm text-white">
          {apiKey}
        </code>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 border border-white/15 bg-black px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-[#4FABFF]/40 hover:text-[#4FABFF]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#4FABFF]" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-2 text-xs text-neutral-600">
        Save this now — for security it won't be shown again.
      </p>
    </div>
  );
}

function IntegrationSnippet({ apiKey }: { apiKey: string }) {
  const snippet = `import OpenAI from 'openai'
import { createOpenAIConfig } from 'promptlens'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...createOpenAIConfig({ apiKey: '${apiKey}' })
})`;
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (await copyToClipboard(snippet)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
        Add to your project
      </p>
      <div className="relative border border-white/15 bg-neutral-950">
        <pre className="overflow-x-auto px-4 py-3 pr-12 font-mono text-xs leading-relaxed text-neutral-300">
          <code>{snippet}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy snippet"
          className="absolute right-2 top-2 border border-white/10 bg-black p-1.5 text-neutral-400 transition-colors hover:border-[#4FABFF]/40 hover:text-[#4FABFF]"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-[#4FABFF]" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
