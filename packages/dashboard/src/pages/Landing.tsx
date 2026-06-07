import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  Home,
  Layers,
  Terminal,
  Zap,
} from "lucide-react";
import { CopyCodeBlock } from "../components/CopyCodeBlock";
import { DemoDashboard } from "../components/DemoDashboard";
import { FeaturesSection } from "../components/FeaturesSection";
import { HeroSection } from "../components/HeroSection";
import { NavBar } from "@/components/ui/tubelight-navbar";

const LANDING_NAV_ITEMS = [
  { name: "Home", url: "#top", icon: Home },
  { name: "How it works", url: "#how", icon: Zap },
  { name: "Setup", url: "#setup", icon: Terminal },
  { name: "Features", url: "#features", icon: Layers },
  { name: "Demo", url: "#demo", icon: BarChart3 },
  { name: "Built for", url: "#built-for", icon: CheckCircle2 },
] as const;

const ACCENTS = ["#076EFF", "#4FABFF", "#B1C5FF"] as const;

export function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <HeroSection signedIn />
      <HowItWorks />
      <GetRunning />
      <ProductLayers />
      <FeaturesSection />
      <DemoSection />
      <BuiltForSection />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
        <div className="pointer-events-auto absolute left-6 top-6">
          <a href="#top" className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center border border-[#076EFF] bg-black text-sm font-bold text-[#4FABFF]">
              PL
            </span>
            <span className="hidden text-base font-semibold tracking-tight text-white sm:inline">
              PromptLens
            </span>
          </a>
        </div>

        <div className="pointer-events-auto absolute right-6 top-6 flex items-center gap-2">
          <Link
            to="/dashboard"
            className="border border-white bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
          >
            Open dashboard
          </Link>
        </div>
      </div>

      <NavBar items={[...LANDING_NAV_ITEMS]} />
    </>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Code2,
      accent: ACCENTS[0],
      title: "Get your API key",
      body: "Sign in once. Create a key in the dashboard. That’s the only account setup.",
      code: "export PROMPTLENS_KEY=pl_live_…",
    },
    {
      icon: Zap,
      accent: ACCENTS[1],
      title: "Plug into your app",
      body: "One npm install. Wrap your existing OpenAI client — no agent, no prompt rewrite.",
      code: `npm install promptlens openai\n\nimport { promptlensOpenAI } from "promptlens";\nconst openai = new OpenAI(\n  promptlensOpenAI({ apiKey: process.env.OPENAI_API_KEY! })\n);`,
    },
    {
      icon: BarChart3,
      accent: ACCENTS[2],
      title: "See spend by feature",
      body: "Every API call is logged. Dashboard shows cost, tokens, and top prompts — live.",
      code: "# your existing chat.completions code — unchanged",
    },
  ];

  return (
    <section id="how" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="How it works"
          title="Three steps to LLM cost visibility"
          subtitle="Built for engineering teams — like TokenGuard for the browser, but for your production LLM stack. One env var, two lines of code."
        />

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <div
              key={s.title}
              className="border border-white/10 bg-black p-6"
            >
              <div
                className="grid h-10 w-10 place-items-center border"
                style={{
                  borderColor: `${s.accent}40`,
                  backgroundColor: `${s.accent}10`,
                  color: s.accent,
                }}
              >
                <s.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                {s.body}
              </p>
              <CopyCodeBlock code={s.code} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function GetRunning() {
  const realDataSteps = [
    {
      n: "1",
      title: "Get your API key",
      body: "It's printed when you seed, or create one on the Keys page in the dashboard.",
    },
    {
      n: "2",
      title: "Point your client at the proxy",
      body: "Target http://localhost:3001 with header x-promptlens-key: pl_live_… and an x-feature-tag.",
    },
    {
      n: "3",
      title: "Make real chat.completions calls",
      body: "Each call is logged with its true model, token usage, cost, and latency.",
    },
    {
      n: "4",
      title: "Watch the dashboard",
      body: "Charts and optimization suggestions update to reflect your genuine usage.",
    },
  ];

  return (
    <section id="setup" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Setup"
          title="Get the app running"
          subtitle="Everything runs locally — no Supabase, no cloud account. Run these from the repo root, then open the dashboard."
        />

        <div className="mt-14 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-white">
              Start from scratch
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              Installs deps, seeds the local SQLite database with demo traffic,
              and boots the proxy and dashboard.
            </p>
            <CopyCodeBlock
              code={[
                "npm install                 # first time only",
                "npm run seed -- --reset     # populate local SQLite with demo traffic",
                "npm run dev:proxy           # terminal 1 -> proxy on :3001",
                "npm run dev:dashboard       # terminal 2 -> dashboard on :5173",
              ].join("\n")}
            />
            <p className="mt-4 text-sm text-neutral-500">
              Then open{" "}
              <span className="font-mono text-[#4FABFF]">
                http://localhost:5173/dashboard
              </span>
              .
            </p>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-white">
              Send real traffic
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-500">
              The seed data is synthetic. To see genuine usage, route real LLM
              calls through the proxy:
            </p>
            <ol className="mt-5 space-y-4">
              {realDataSteps.map((s) => (
                <li key={s.n} className="flex gap-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center border border-[#076EFF]/40 bg-[#076EFF]/10 text-xs font-bold text-[#4FABFF]">
                    {s.n}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{s.title}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-neutral-500">
                      {s.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <CopyCodeBlock
              code={"node examples/customer-demo.mjs   # fires real calls through the proxy"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductLayers() {
  const layers = [
    {
      phase: "Layer 1 — Live",
      title: "Observability",
      detail:
        "Summarization costs $4.2k/mo. Chatbot $800. Search $200. Your OpenAI bill never breaks this down — we do.",
      code: 'feature: "summarization"',
    },
    {
      phase: "Layer 2 — Building",
      title: "Optimization",
      detail:
        "Compress bloated system prompts before they hit the model. TokenGuard logic, running in your proxy — 20–40% input savings on verbose prompts.",
      code: "compress: true  // SDK flag → x-promptlens-compress",
    },
    {
      phase: "Layer 3 — Foundation",
      title: "Governance",
      detail:
        "Monthly budget per feature. Max tokens per request. 429 when a team blows their cap — no codebase changes.",
      code: 'monthly_budget_usd: 5000  // dashboard policies API',
    },
  ];

  return (
    <section id="layers" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Product"
          title="Observe → optimize → enforce"
          subtitle="One proxy in your API path. Three layers that compound as you scale — from startup spend to enterprise controls."
        />
        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {layers.map((l) => (
            <div key={l.title} className="border border-white/10 bg-black p-6">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
                {l.phase}
              </p>
              <h3 className="mt-3 text-lg font-semibold text-white">{l.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-500">{l.detail}</p>
              <CopyCodeBlock code={l.code} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  return (
    <section id="demo" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Live demo"
          title="See it in action"
          subtitle="Real charts, real components, sample data. Everything you see here is exactly what shows up in your dashboard once you start sending traffic."
        />

        <div className="mt-10 border border-white/10">
          <DemoDashboard variant="dark" />
        </div>
      </div>
    </section>
  );
}

function BuiltForSection() {
  const capabilities = [
    {
      label: "Per-request logging",
      detail: "Every call captured with latency, tokens, and status",
    },
    {
      label: "Cost dashboard",
      detail: "Today, this week, and this month at a glance",
    },
    {
      label: "Cost attribution by feature",
      detail: "Auto-inferred from your request path — no manual tagging",
      highlight: true,
    },
    {
      label: "Top prompt templates by spend",
      detail: "Rank prompt hashes by total cost and volume",
      highlight: true,
    },
    {
      label: "Optimization suggestions",
      detail: "Compressed prompt recommendations to cut token waste",
      highlight: true,
    },
  ];

  return (
    <section id="built-for" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Built for teams"
          title="Costs are table stakes. We tell you what to do about them."
          subtitle="PromptLens goes beyond spend totals — see which feature is responsible and how to spend less."
        />

        <div className="mt-10 overflow-hidden border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3 text-left font-medium">Capability</th>
                <th className="px-5 py-3 text-left font-medium text-[#4FABFF]">
                  What you get
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {capabilities.map((row) => (
                <tr
                  key={row.label}
                  className={row.highlight ? "bg-[#076EFF]/[0.04]" : ""}
                >
                  <td className="px-5 py-4 font-medium text-white">
                    {row.label}
                  </td>
                  <td className="px-5 py-4 text-[#B1C5FF]">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 bg-black">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#076EFF] to-transparent opacity-60" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FFB7C5]/40 to-transparent opacity-40" />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
          Get started
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Stop guessing what you&apos;re spending on.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-neutral-500">
          Two lines of code and a single seed command — full LLM cost
          attribution for your team, running locally.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 border border-white bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
          >
            Open your dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#demo"
            className="border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-[#4FABFF]/50 hover:bg-[#076EFF]/10"
          >
            Replay the demo
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 py-8 text-xs text-neutral-600 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center border border-[#076EFF]/50 bg-black text-[10px] font-bold text-[#4FABFF]">
            PL
          </span>
          <span className="flex items-center gap-1.5">
            PromptLens v0.1
            <Layers className="h-3 w-3 text-neutral-600" />
          </span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#how" className="transition-colors hover:text-white">
            How it works
          </a>
          <a href="#setup" className="transition-colors hover:text-white">
            Setup
          </a>
          <a href="#features" className="transition-colors hover:text-white">
            Features
          </a>
          <a href="#demo" className="transition-colors hover:text-white">
            Demo
          </a>
          <a href="#built-for" className="transition-colors hover:text-white">
            Built for
          </a>
          <Link to="/dashboard" className="transition-colors hover:text-white">
            Dashboard
          </Link>
        </div>
      </div>
    </footer>
  );
}

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle: string;
}

function SectionHeader({ eyebrow, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
        {eyebrow}
      </div>
      <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base leading-relaxed text-neutral-500">{subtitle}</p>
    </div>
  );
}
