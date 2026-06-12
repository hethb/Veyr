import { Link } from "react-router-dom";
import CanopyMark, { CanopyWordmark } from "../components/CanopyMark";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
  Globe,
  Home,
  Layers,
  Monitor,
  Terminal,
  Zap,
} from "lucide-react";
import { CopyCodeBlock } from "../components/CopyCodeBlock";
import { DemoDashboard } from "../components/DemoDashboard";
import { FeaturesSection } from "../components/FeaturesSection";
import { HeroSection } from "../components/HeroSection";
import { MagicLinkForm } from "../components/MagicLinkForm";
import { authEnabled } from "../lib/auth";
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
      <HeroSection authEnabled={authEnabled} />
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
            <CanopyMark className="h-8 w-8" />
            <span className="hidden sm:inline">
              <CanopyWordmark className="text-base" />
            </span>
          </a>
        </div>

        <div className="pointer-events-auto absolute right-6 top-6 flex items-center gap-2">
          {authEnabled ? (
            <a
              href="#get-started"
              className="border border-white bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              Get started
            </a>
          ) : (
            <Link
              to="/dashboard"
              className="border border-white bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              Open dashboard
            </Link>
          )}
        </div>
      </div>

      <NavBar items={[...LANDING_NAV_ITEMS]} />
    </>
  );
}

function HowItWorks() {
  const firstStep = authEnabled
    ? {
        icon: Code2,
        accent: ACCENTS[0],
        title: "Sign up with your email",
        body: "Enter your email at the bottom of this page and click the magic link — no password, no credit card. Copy the key from your welcome page and export it:",
        code: "export PROMPTLENS_KEY=pl_live_…  # your key — shown once",
      }
    : {
        icon: Code2,
        accent: ACCENTS[0],
        title: "Get your API key",
        body: "Run it locally with no account, or deploy with email sign-in. Create a key and you're set.",
        code: "export PROMPTLENS_KEY=pl_live_…",
      };

  const steps = [
    firstStep,
    {
      icon: Zap,
      accent: ACCENTS[1],
      title: "Plug into your app",
      body: "One npm install. Wrap your existing OpenAI client — it picks up PROMPTLENS_KEY from step 1 and routes through Canopy automatically.",
      code: `npm install canopy-sdk openai\n\nimport { promptlensOpenAI } from "canopy-sdk";\nconst openai = new OpenAI(\n  promptlensOpenAI({ apiKey: process.env.OPENAI_API_KEY! })\n);`,
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

interface SetupStep {
  title: string;
  /** Plain-language explanation of exactly what to do / what you'll see. */
  detail?: string;
  code?: string;
}

function StepList({ steps }: { steps: SetupStep[] }) {
  return (
    <ol className="mt-6 space-y-5">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center border border-[#076EFF]/40 bg-[#076EFF]/10 text-xs font-bold text-[#4FABFF]">
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">{s.title}</p>
            {s.detail && (
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">{s.detail}</p>
            )}
            {s.code && <CopyCodeBlock code={s.code} className="mt-3" />}
          </div>
        </li>
      ))}
    </ol>
  );
}

function GetRunning() {
  // The proxy this deployment fronts — baked in at build time so the copyable
  // commands are correct for wherever this page is served from.
  const proxyBase =
    (import.meta.env.VITE_PROXY_URL as string | undefined)?.replace(/\/+$/, "") ||
    "http://localhost:3001";

  // Hosted visitors get hosted commands; the local/desktop build keeps the
  // run-on-your-machine instructions.
  const primarySteps: SetupStep[] = authEnabled
    ? [
        {
          title: "Create your account and copy your Canopy key",
          detail:
            "Scroll to the bottom of this page (or click “Get started” top-right), enter your email, and click the magic link we send you. You'll land on a welcome page showing a key starting with pl_live_… — click Copy. It is shown only once, so save it now.",
        },
        {
          title: "Install the SDK and wrap your OpenAI client",
          detail:
            "In your project, run the install, then create the client like this. Replace pl_live_… with the key from step 1. Your OpenAI key stays in OPENAI_API_KEY exactly as it is today. Then use `openai` exactly as before — nothing else changes. (Anthropic? Use promptlensAnthropic the same way.)",
          code:
            "npm install canopy-sdk openai\n\n" +
            'import OpenAI from "openai";\n' +
            'import { promptlensOpenAI } from "canopy-sdk";\n\n' +
            "const openai = new OpenAI(promptlensOpenAI({\n" +
            "  apiKey: process.env.OPENAI_API_KEY!,  // your OpenAI key — unchanged\n" +
            '  promptlensKey: "pl_live_…",           // ← paste YOUR key from step 1\n' +
            `  baseUrl: "${proxyBase}",\n` +
            "}));",
        },
        {
          title: "Using Claude Code instead? Paste these two lines",
          detail:
            "Run these in the same terminal where you run `claude` (replace pl_live_… with your key). Every Claude Code request is then metered. To make it permanent, add both lines to your ~/.zshrc.",
          code:
            `export ANTHROPIC_BASE_URL=${proxyBase}/anthropic\n` +
            'export ANTHROPIC_CUSTOM_HEADERS="x-promptlens-key: pl_live_…"\n' +
            "claude",
        },
        {
          title: "Send one request, then open your dashboard",
          detail:
            "Make any LLM call through the client (or just ask Claude Code something). Then open the Dashboard link in the footer below (it's /dashboard — you're already signed in). The request appears within seconds with its cost, tokens, and feature tag.",
        },
      ]
    : [
        {
          title: "Install and launch the desktop app",
          code: "npm install\nnpm run desktop",
        },
        {
          title: "Optional — load demo data to explore the dashboard",
          code: "npm run seed -- --reset",
        },
        {
          title: "Route a CLI agent like Claude Code through Canopy",
          code:
            "# enable local logging (in .env)\nPROMPTLENS_ALLOW_ANON=true\n\n" +
            "# point Claude Code at the proxy, then run it\nexport ANTHROPIC_BASE_URL=http://localhost:3001/anthropic\nclaude",
        },
        {
          title: "…or wrap your own OpenAI / Anthropic code",
          code:
            "import { createOpenAIConfig } from 'canopy-sdk'\n\n" +
            "const openai = new OpenAI({\n  apiKey: process.env.OPENAI_API_KEY,\n  ...createOpenAIConfig({ apiKey: 'pl_live_…', baseUrl: 'http://localhost:3001' })\n})",
        },
      ];

  const secondarySteps: SetupStep[] = authEnabled
    ? [
        {
          title: "Clone the repo and launch the desktop app",
          detail:
            "Requires Node 20+. The dashboard opens in its own window, the proxy starts automatically on port 3001, and a first-run screen shows your local API key. No account, no cloud — data stays in ~/.promptlens on your machine.",
          code:
            "git clone https://github.com/hethb/PromptLens\ncd PromptLens && npm install\nnpm run desktop",
        },
        {
          title: "Or set up from the terminal in one command",
          detail:
            "An interactive wizard: choose “Local”, let it start the proxy, then pick your integration (OpenAI SDK, Anthropic SDK, Claude Code, or Cursor). It prints the exact snippet to paste.",
          code: "npx getcanopy init",
        },
        {
          title: "Local proxies log Claude Code with zero config",
          detail:
            "No key needed locally — anonymous requests are logged automatically and tagged claude-code-cli.",
          code: "export ANTHROPIC_BASE_URL=http://localhost:3001/anthropic\nclaude",
        },
      ]
    : [
        { title: "Open chrome://extensions and turn on Developer mode" },
        { title: "Click “Load unpacked” and select packages/browser-extension" },
        { title: "Open chatgpt.com or claude.ai — the widget appears bottom-right" },
      ];

  return (
    <section id="setup" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Get started"
          title="Two ways to run Canopy"
          subtitle={
            authEnabled
              ? "Use this hosted instance with a free account, or clone the repo and run everything on your own machine."
              : "Pick the surface that matches how you use LLMs. Both run on your machine — no cloud account required."
          }
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* Option 1 — Desktop app + proxy */}
          <div className="flex flex-col border border-white/10 bg-black p-6">
            <div className="flex items-center gap-3">
              <div
                className="grid h-10 w-10 place-items-center border"
                style={{
                  borderColor: `${ACCENTS[0]}40`,
                  backgroundColor: `${ACCENTS[0]}10`,
                  color: ACCENTS[0],
                }}
              >
                <Monitor className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#4FABFF]">
                  {authEnabled ? "Hosted — this site" : "For CLI agents & code"}
                </p>
                <h3 className="text-lg font-semibold text-white">
                  {authEnabled ? "Use the hosted proxy" : "Desktop app + proxy"}
                </h3>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-neutral-500">
              {authEnabled ? (
                <>
                  Sign up with an email, get a key, and point your existing
                  OpenAI/Anthropic client (or{" "}
                  <span className="text-neutral-300">Claude Code</span>) at the
                  Canopy proxy. Your provider API key stays yours — Canopy
                  forwards it and meters the traffic.
                </>
              ) : (
                <>
                  Best if you use a CLI agent like{" "}
                  <span className="text-neutral-300">Claude Code</span> or call
                  the OpenAI/Anthropic APIs from your own code. The desktop app
                  auto-starts the proxy and dashboard, shows today&apos;s spend
                  in your menu bar, and includes a{" "}
                  <span className="text-neutral-300">Prompt Helper</span> that
                  tightens your prompts before you send them.
                </>
              )}
            </p>
            <StepList steps={primarySteps} />
            <p className="mt-6 text-xs text-neutral-600">
              {authEnabled
                ? "The npm packages are public: canopy-sdk (wrapper) and getcanopy (CLI)."
                : "Prefer your editor? A VSCode extension offers the same panel and one-click Claude Code routing."}
            </p>
          </div>

          {/* Option 2 — Browser extension */}
          <div className="flex flex-col border border-white/10 bg-black p-6">
            <div className="flex items-center gap-3">
              <div
                className="grid h-10 w-10 place-items-center border"
                style={{
                  borderColor: `${ACCENTS[1]}40`,
                  backgroundColor: `${ACCENTS[1]}10`,
                  color: ACCENTS[1],
                }}
              >
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#4FABFF]">
                  {authEnabled ? "Self-hosted / local" : "For chatgpt.com & claude.ai"}
                </p>
                <h3 className="text-lg font-semibold text-white">
                  {authEnabled ? "Run it on your machine" : "Browser extension"}
                </h3>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-neutral-500">
              {authEnabled ? (
                <>
                  Everything is open source. The{" "}
                  <span className="text-neutral-300">desktop app</span> runs the
                  proxy and dashboard locally with no account — your traffic and
                  keys never leave your machine. Deploying your own instance is
                  one <span className="text-neutral-300">fly deploy</span> (see
                  DEPLOY.md in the repo).
                </>
              ) : (
                <>
                  Want Canopy right inside the{" "}
                  <span className="text-neutral-300">ChatGPT and Claude</span>{" "}
                  web apps? The extension overlays live token &amp; cost
                  estimates and suggests better prompts as you type — before you
                  hit send. No proxy required.
                </>
              )}
            </p>
            <StepList steps={secondarySteps} />
            <p className="mt-6 text-xs text-neutral-600">
              {authEnabled
                ? "A browser extension (ChatGPT/Claude overlay) and VSCode extension ship in the repo too."
                : "Running the desktop app too? The widget will also surface your real logged spend and top suggestion."}
            </p>
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
          subtitle="Canopy goes beyond spend totals — see which feature is responsible and how to spend less."
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

      <div id="get-started" className="relative mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
          Get started
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Stop guessing what you&apos;re spending on.
        </h2>
        {authEnabled ? (
          <>
            <p className="mx-auto mt-4 max-w-xl text-base text-neutral-500">
              Enter your email — we&apos;ll send a magic link. No password, no
              credit card. You&apos;ll have an API key in under a minute.
            </p>
            <div className="mt-8">
              <MagicLinkForm />
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 py-8 text-xs text-neutral-600 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <CanopyMark className="h-6 w-6" />
          <span className="flex items-center gap-1.5">
            Canopy v0.1
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
