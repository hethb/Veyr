import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DemoDashboard } from "../components/DemoDashboard";
import { supabase } from "../lib/supabase";

export function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSignedIn(Boolean(data.session));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (mounted) setSignedIn(Boolean(s));
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <Header signedIn={signedIn} />
      <Hero />
      <HowItWorks />
      <DemoSection />
      <VsHelicone />
      <FinalCta signedIn={signedIn} />
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
            PL
          </span>
          <span className="text-base font-semibold">PromptLens</span>
        </a>

        <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
          <a href="#how" className="hover:text-slate-900">How it works</a>
          <a href="#demo" className="hover:text-slate-900">Demo</a>
          <a href="#compare" className="hover:text-slate-900">vs Helicone</a>
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              >
                Sign in
              </Link>
              <Link
                to="/login"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-b from-indigo-50/60 via-white to-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-24 text-center sm:py-32">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-medium text-indigo-700 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
          v0.1 — drop-in proxy for OpenAI &amp; Anthropic
        </span>

        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl md:text-6xl">
          See exactly where your{" "}
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
            LLM spend
          </span>{" "}
          is going.
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          PromptLens is a drop-in proxy that gives engineering teams full
          visibility into their LLM API costs — broken down by feature, model,
          and prompt template. Swap your <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-sm text-slate-800">baseURL</code>{" "}
          and get a dashboard in minutes.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#demo"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            See live demo
            <span aria-hidden>↓</span>
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Get started
            <span aria-hidden>→</span>
          </Link>
        </div>

        <div className="mx-auto mt-12 max-w-xl rounded-xl border border-slate-200 bg-slate-900 p-4 text-left shadow-xl">
          <pre className="overflow-x-auto text-xs leading-relaxed text-slate-100">
{`import OpenAI from "openai";
import { createOpenAIConfig } from "promptlens";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  ...createOpenAIConfig({ apiKey: process.env.PROMPTLENS_KEY }),
});`}
          </pre>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Install the SDK",
      body: "One npm package. No agent, no SDK rewrite.",
      code: "npm install promptlens",
    },
    {
      n: "2",
      title: "Swap your baseURL",
      body: "Two extra lines on your existing OpenAI or Anthropic client.",
      code: '...createOpenAIConfig({ apiKey: process.env.PROMPTLENS_KEY })',
    },
    {
      n: "3",
      title: "Open the dashboard",
      body: "Costs are auto-attributed to features and prompt templates.",
      code: "open dashboard.promptlens.dev",
    },
  ];

  return (
    <section id="how" className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeader
          eyebrow="How it works"
          title="Three steps to LLM cost visibility"
          subtitle="No infrastructure changes. No reformatting prompts. No agent in your hot path."
        />

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.n}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              <div className="mt-4 rounded-lg bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100">
                {s.code}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Embedded demo
// ---------------------------------------------------------------------------

function DemoSection() {
  return (
    <section id="demo" className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeader
          eyebrow="Live demo"
          title="See it in action"
          subtitle="Real charts, real components, sample data. Everything you see here is exactly what shows up in your dashboard once you start sending traffic."
        />

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <DemoDashboard />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

function VsHelicone() {
  const rows = [
    {
      label: "Per-request logging",
      helicone: "yes",
      promptlens: "yes",
    },
    {
      label: "Cost dashboard",
      helicone: "yes",
      promptlens: "yes",
    },
    {
      label: "Cost attribution by feature",
      helicone: "manual tagging",
      promptlens: "auto-inferred from request path",
      highlight: true,
    },
    {
      label: "Top prompt templates by spend",
      helicone: "partial",
      promptlens: "first-class",
      highlight: true,
    },
    {
      label: "Optimization suggestions (compressed prompts)",
      helicone: "no",
      promptlens: "yes",
      highlight: true,
    },
  ];

  return (
    <section id="compare" className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <SectionHeader
          eyebrow="vs Helicone"
          title="Costs are table stakes. We tell you what to do about them."
          subtitle="Helicone shows you that you're spending money. PromptLens tells you which feature is responsible — and how to spend less."
        />

        <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 text-left font-medium">Capability</th>
                <th className="px-5 py-3 text-left font-medium">Helicone</th>
                <th className="px-5 py-3 text-left font-medium text-indigo-700">
                  PromptLens
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr
                  key={row.label}
                  className={row.highlight ? "bg-indigo-50/30" : ""}
                >
                  <td className="px-5 py-4 font-medium text-slate-900">
                    {row.label}
                  </td>
                  <td className="px-5 py-4 text-slate-600">{row.helicone}</td>
                  <td className="px-5 py-4 font-medium text-indigo-700">
                    {row.promptlens}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="bg-slate-900 text-white">
      <div className="mx-auto max-w-3xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Stop guessing what you're spending on.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-slate-300">
          Two lines of code, a free Supabase project, and you have full LLM
          cost attribution for your team.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={signedIn ? "/dashboard" : "/login"}
            className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-slate-100"
          >
            {signedIn ? "Open your dashboard" : "Get started"}
          </Link>
          <a
            href="#demo"
            className="rounded-xl border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Replay the demo
          </a>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 py-8 text-xs text-slate-500 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded bg-indigo-600 text-[10px] font-bold text-white">
            PL
          </span>
          <span>PromptLens v0.1</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#how" className="hover:text-slate-900">How it works</a>
          <a href="#demo" className="hover:text-slate-900">Demo</a>
          <Link to="/login" className="hover:text-slate-900">Sign in</Link>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Section header helper
// ---------------------------------------------------------------------------

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
}

function SectionHeader({ eyebrow, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
        {eyebrow}
      </div>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-base text-slate-600">{subtitle}</p>
    </div>
  );
}
