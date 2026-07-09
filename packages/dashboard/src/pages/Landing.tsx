import { Link } from "react-router-dom";
import VeyrMark, { VeyrWordmark } from "../components/VeyrMark";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Code2,
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
  { name: "Download", url: "#download", icon: Monitor },
] as const;

const ACCENTS = ["#076EFF", "#4FABFF", "#B1C5FF"] as const;

export function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <HeroSection authEnabled={authEnabled} />
      <HowItWorks />
      <GetRunning />
      <PrivacySection />
      <ProductLayers />
      <FeaturesSection />
      <DemoSection />
      <BuiltForSection />
      <DownloadSection />
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
            <VeyrMark className="h-8 w-8" />
            <span className="hidden sm:inline">
              <VeyrWordmark className="text-base" />
            </span>
          </a>
        </div>

        <div className="pointer-events-auto absolute right-6 top-6 flex items-center gap-2">
          <a
            href="#download"
            className="hidden border border-white/20 px-3 py-2 text-sm font-medium text-white transition-colors hover:border-white sm:inline-flex"
          >
            Download
          </a>
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
  const steps = [
    {
      icon: Monitor,
      accent: ACCENTS[0],
      title: "Install Veyr",
      body: "Veyr is a native Mac app that lives in your menu bar. Download the DMG below (Homebrew coming soon). No account, no API key, no configuration needed to get started.",
      code: "# one download — no account, no API key",
    },
    {
      icon: Terminal,
      accent: ACCENTS[1],
      title: "Open Claude Code",
      body: "Veyr reads your local session logs automatically. The moment you start a session, Veyr shows you the cost in real time — by project, by model, by session. (Cursor support is on the roadmap.)",
      code: "ls ~/.claude/projects  # the logs Veyr reads",
    },
    {
      icon: Zap,
      accent: ACCENTS[2],
      title: "Let Veyr optimize",
      body: "Veyr analyzes your usage patterns and injects recommendations directly into your Claude Code context (on by default, off in one click). Your agent learns to switch models for simple tasks and compact context when sessions get long.",
      code: "cat ~/.veyr/agent-status/VEYR_STATUS.json",
    },
  ];

  return (
    <section id="how" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="How it works"
          title="Three steps to knowing your burn rate"
          subtitle="No proxy, no traffic interception, no account. Veyr reads the session logs Claude Code already writes to your disk."
        />
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={i} className="flex flex-col border border-white/10 bg-black p-6">
              <div
                className="grid h-10 w-10 place-items-center border"
                style={{
                  borderColor: `${step.accent}40`,
                  backgroundColor: `${step.accent}10`,
                  color: step.accent,
                }}
              >
                <step.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">
                {i + 1}. {step.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-500">
                {step.body}
              </p>
              <CopyCodeBlock code={step.code} className="mt-4" />
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
  const macSteps: SetupStep[] = [
    {
      title: "Download Veyr",
      detail: "Grab Veyr-0.2.2.dmg with the button below (or in the Download section).",
    },
    {
      title: "Install",
      detail: "Open the DMG, drag Veyr to your Applications folder, then open Veyr from Applications.",
    },
    {
      title: "Bypass Gatekeeper (required for unsigned builds)",
      detail:
        "Veyr is not yet notarized with Apple. This command removes the quarantine flag so macOS allows it to run. It is safe — it only affects the Veyr app.",
      code: "xattr -cr /Applications/Veyr.app",
    },
    {
      title: "Start a Claude Code session",
      detail:
        "Veyr will automatically detect your Claude Code sessions and begin tracking cost. No configuration needed.",
    },
    {
      title: "CLAUDE.md spend status is on by default",
      detail:
        "Veyr keeps a marker-delimited block in your active project's CLAUDE.md so Claude Code sees its burn rate, budget, and tips at session start. Disable in Veyr → Settings → Veyr if you prefer.",
    },
    {
      title: "Optional — add your Anthropic API key",
      detail:
        "Settings → Veyr → Anthropic API key (stored in the macOS Keychain). Enables AI task-complexity analysis with Haiku (~$0.01/day typical) — Veyr then reports cost wasted running simple tasks on frontier models.",
    },
  ];

  const vscodeSteps: SetupStep[] = [
    {
      title: "Download the extension",
      detail: "Grab veyr-vscode-0.2.1.vsix with the button below.",
    },
    {
      title: "Install from VSIX",
      detail:
        "Open VS Code → Extensions panel (Cmd+Shift+X) → click ··· (top right) → \"Install from VSIX…\" → choose the downloaded file.",
    },
    {
      title: "Done — it activates automatically",
      detail:
        "You'll see Veyr in the status bar the next time a Claude Code session is active (the Mac app must be running — it writes the feed the extension reads).",
    },
  ];

  return (
    <section id="setup" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Get started"
          title="Get started in 5 minutes"
          subtitle="Install the Mac app, open Claude Code, and your spend appears. Add the VS Code extension to see it in your editor."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {/* Option A — macOS app */}
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
                  Option A — recommended
                </p>
                <h3 className="text-lg font-semibold text-white">macOS app</h3>
              </div>
            </div>
            <StepList steps={macSteps} />
            <a
              href="/downloads/Veyr-0.2.2.dmg"
              download
              className="mt-6 inline-flex w-fit items-center gap-2 border border-white bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              <Monitor className="h-4 w-4" />
              Download Veyr-0.2.2.dmg
            </a>
          </div>

          {/* Option B — VS Code extension */}
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
                <Code2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#4FABFF]">
                  Option B
                </p>
                <h3 className="text-lg font-semibold text-white">
                  VS Code extension
                </h3>
              </div>
            </div>
            <StepList steps={vscodeSteps} />
            <a
              href="/downloads/veyr-vscode-0.2.1.vsix"
              download
              className="mt-6 inline-flex w-fit items-center gap-2 border border-white bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              <Code2 className="h-4 w-4" />
              Download veyr-vscode-0.2.1.vsix
            </a>

            {/* Option C — Homebrew (coming soon) */}
            <div className="relative mt-8">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#4FABFF]">
                Option C
              </p>
              <div className="relative mt-2">
                <CopyCodeBlock code="brew install --cask veyr" />
                <span className="absolute -top-2 right-2 border border-[#f5a623]/50 bg-black px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#f5a623]">
                  Coming soon
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PrivacySection() {
  const points = [
    <>
      Veyr reads your Claude Code and Codex log files from your local disk — the
      same files your terminal shows with{" "}
      <code className="text-neutral-300">ls ~/.claude/projects/</code>
    </>,
    <>No proxy. No traffic interception. No account required.</>,
    <>
      By default the Mac app&apos;s only network call fetches the public
      models.dev pricing catalog. Optionally, add your own Anthropic API key to
      enable AI task-complexity analysis — a small Haiku call using your key,
      which you control. Off until you add a key.
    </>,
    <>
      Session history is stored in{" "}
      <code className="text-neutral-300">~/.veyr/</code> on your machine.
      Nothing is uploaded.
    </>,
  ];

  return (
    <section id="privacy" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Privacy"
          title="Your code never leaves your machine"
          subtitle="Veyr is local-first by construction, not by policy."
        />
        <ul className="mx-auto mt-10 max-w-2xl space-y-4">
          {points.map((point, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-neutral-400">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4FABFF]" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
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
      code: "compress: true  // SDK flag → x-veyr-compress",
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
          subtitle="Veyr goes beyond spend totals — see which feature is responsible and how to spend less."
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

const MAC_DMG_URL = "/downloads/Veyr-0.2.2.dmg";
const VSIX_URL = "/downloads/veyr-vscode-0.2.1.vsix";

function DownloadSection() {
  return (
    <section id="download" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Download"
          title="Veyr on your machine"
          subtitle="A native menu bar app that reads your local Claude Code logs — live spend, budgets, and an agent-readable status feed. No proxy required."
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="flex flex-col border border-white/10 p-8">
            <Monitor className="h-6 w-6 text-[#4FABFF]" />
            <h3 className="mt-4 text-lg font-semibold text-white">Veyr for macOS</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-400">
              Menu bar spend with a live-session pulse, spend dashboard, budget
              caps with notifications, optimization tips, and the{" "}
              <code className="text-neutral-300">VEYR_STATUS.json</code> agent
              feed your coding agents can read to self-optimize.
            </p>
            <a
              href={MAC_DMG_URL}
              download
              className="mt-6 inline-flex w-fit items-center gap-2 border border-white bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              <Monitor className="h-4 w-4" />
              Download for macOS (.dmg)
            </a>
            <p className="mt-4 text-xs leading-relaxed text-neutral-600">
              macOS 14+ · Apple Silicon &amp; Intel · v0.1.0 · unsigned preview
              build — after installing, run{" "}
              <code className="text-neutral-400">xattr -cr /Applications/Veyr.app</code>{" "}
              once to pass Gatekeeper.
            </p>
          </div>

          <div className="flex flex-col border border-white/10 p-8">
            <Code2 className="h-6 w-6 text-[#4FABFF]" />
            <h3 className="mt-4 text-lg font-semibold text-white">
              Veyr for VS Code
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-400">
              Live session cost in your status bar and a panel with burn rate,
              cache hit rate, and one-click optimization commands — fed by the
              Mac app&apos;s local agent feed.
            </p>
            <a
              href={VSIX_URL}
              download
              className="mt-6 inline-flex w-fit items-center gap-2 border border-white bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              <Code2 className="h-4 w-4" />
              Download the extension (.vsix)
            </a>
            <p className="mt-4 text-xs leading-relaxed text-neutral-600">
              Install from file: Extensions panel → ··· → Install from VSIX. Or
              build from source in{" "}
              <code className="text-neutral-400">packages/vscode-extension</code>.
            </p>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-neutral-600">
          What Veyr reads: your local Claude Code logs
          (~/.claude/projects). Nothing leaves your machine — no server, no
          analytics. The Mac app is built on{" "}
          <a
            href="https://github.com/steipete/CodexBar"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-neutral-400"
          >
            CodexBar
          </a>{" "}
          by Peter Steinberger (MIT).
        </p>
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
          <VeyrMark className="h-6 w-6" />
          <span className="flex items-center gap-1.5">
            Veyr v0.1
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
          <a
            href="https://github.com/hethb/Veyr"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-white"
          >
            GitHub
          </a>
          <Link to="/dashboard" className="transition-colors hover:text-white">
            Dashboard
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-6xl border-t border-white/5 px-6 py-4 text-center text-xs text-neutral-600">
        Veyr&apos;s macOS app is built on{" "}
        <a
          href="https://github.com/steipete/CodexBar"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-neutral-700 underline-offset-2 transition-colors hover:text-neutral-400"
        >
          CodexBar
        </a>{" "}
        by Peter Steinberger (
        <a
          href="https://github.com/steipete"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-neutral-700 underline-offset-2 transition-colors hover:text-neutral-400"
        >
          steipete
        </a>
        ) · MIT License
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
