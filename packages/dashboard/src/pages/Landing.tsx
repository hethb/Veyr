import { type ReactNode } from "react";
import VeyrMark from "../components/VeyrMark";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Layers,
  Monitor,
  Terminal,
  Zap,
} from "lucide-react";
import { CopyCodeBlock } from "../components/CopyCodeBlock";
import { FeaturesSection } from "../components/FeaturesSection";
import { GraphDemo } from "../components/GraphDemo";
import { HeroSection } from "../components/HeroSection";
import { WorksWithSection } from "../components/WorksWithSection";
import { AnimatedNav, type AnimatedNavItem } from "@/components/ui/animated-nav";

const LANDING_NAV_ITEMS: AnimatedNavItem[] = [
  { name: "How it works", href: "#how" },
  { name: "Usage", href: "#usage", mobileHidden: true },
  { name: "Graph", href: "#graph", mobileHidden: true },
  { name: "Setup", href: "#setup" },
  { name: "Features", href: "#features", mobileHidden: true },
  { name: "Compare", href: "#compare", mobileHidden: true },
  { name: "Download", href: "#download" },
];

const ACCENTS = ["#076EFF", "#4FABFF", "#B1C5FF"] as const;
const VEYR_VERSION = "0.2.2";
const MAC_DMG_URL = `/downloads/Veyr-${VEYR_VERSION}.dmg`;
const VSIX_URL = "/downloads/veyr-vscode-0.2.1.vsix";

export function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <HeroSection />
      <WorksWithSection />
      <HowItWorks />
      <UsageSection />
      <GraphSection />
      <GetRunning />
      <PrivacySection />
      <ComparisonSection />
      <FeaturesSection />
      <DownloadSection />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <AnimatedNav
      items={LANDING_NAV_ITEMS}
      // Keep the nav expanded while the full-viewport hero is on screen.
      collapseAfter={() => {
        const hero = document.getElementById("top");
        return hero
          ? Math.max(hero.offsetHeight - window.innerHeight, 150)
          : 150;
      }}
    />
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: Monitor,
      accent: ACCENTS[0],
      title: "Install a surface",
      body: "Menu bar app, VS Code extension, or CLI — pick one, or use all three, they read the same local data. No account, no API key, no configuration needed to get started.",
      code: "npm install -g getcanopy   # or download the .dmg / .vsix",
    },
    {
      icon: Terminal,
      accent: ACCENTS[1],
      title: "Open Claude Code",
      body: "Veyr reads your local session logs automatically. The moment you start a session, Veyr shows you the cost in real time — by project, by model, by session. (Codex CLI and other providers are read the same way.)",
      code: "ls ~/.claude/projects  # the logs Veyr reads",
    },
    {
      icon: Zap,
      accent: ACCENTS[2],
      title: "Let Veyr feed context back",
      body: "Veyr writes a spend, budget, and codebase-graph summary into your project's CLAUDE.md (on by default, one click to disable) — so your agent knows its burn rate and the shape of the codebase before it starts guessing.",
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

interface InstallCardProps {
  icon: typeof Monitor;
  label: string;
  title: string;
  steps: SetupStep[];
  cta: { href: string; label: string; download?: boolean; external?: boolean };
  accent: string;
  footnote?: ReactNode;
}

function InstallCard({ icon: Icon, label, title, steps, cta, accent, footnote }: InstallCardProps) {
  return (
    <div className="flex flex-col border border-white/10 bg-black p-6">
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 place-items-center border"
          style={{ borderColor: `${accent}40`, backgroundColor: `${accent}10`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#4FABFF]">
            {label}
          </p>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
        </div>
      </div>
      <StepList steps={steps} />
      <a
        href={cta.href}
        download={cta.download}
        target={cta.external ? "_blank" : undefined}
        rel={cta.external ? "noreferrer" : undefined}
        className="mt-6 inline-flex w-fit items-center gap-2 border border-white bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
      >
        <Icon className="h-4 w-4" />
        {cta.label}
      </a>
      {footnote && <div className="mt-6">{footnote}</div>}
    </div>
  );
}

function GetRunning() {
  const macSteps: SetupStep[] = [
    { title: "Download Veyr", detail: `Grab Veyr-${VEYR_VERSION}.dmg with the button below.` },
    {
      title: "Install",
      detail: "Open the DMG, drag Veyr to your Applications folder, then open Veyr from Applications.",
    },
    {
      title: "Bypass Gatekeeper (required for unsigned builds)",
      detail: "Removes the quarantine flag so macOS allows it to run. Safe — only affects the Veyr app.",
      code: "xattr -cr /Applications/Veyr.app",
    },
    {
      title: "Start a Claude Code session",
      detail: "Veyr detects it automatically and begins tracking cost. No configuration needed.",
    },
  ];

  const vscodeSteps: SetupStep[] = [
    { title: "Download the extension", detail: "Grab veyr-vscode-0.2.1.vsix with the button below." },
    {
      title: "Install from VSIX",
      detail:
        "VS Code → Extensions panel (Cmd+Shift+X) → ··· (top right) → \"Install from VSIX…\" → choose the downloaded file.",
    },
    {
      title: "Done — it activates automatically",
      detail: "Status bar shows spend the next time a session is active (the Mac app must be running — it writes the local feed the extension reads).",
    },
  ];

  const cliSteps: SetupStep[] = [
    { title: "Install", detail: "Requires Node 20+. Nothing else to download — no app, no extension.", code: "npm install -g getcanopy" },
    { title: "Or via Homebrew", code: "brew install hethb/veyr/veyr" },
    {
      title: "Check your spend",
      detail: "Scans your local session logs directly and prices them itself.",
      code: "veyr status",
    },
    {
      title: "Build the codebase graph",
      detail: "Runs Graphify locally (Python 3.10+) — same graph the app builds.",
      code: "veyr graph --refresh",
    },
    {
      title: "Update anytime",
      detail: "The CLI checks npm once a day and prints this command when you're behind.",
      code: "npm install -g getcanopy@latest",
    },
  ];

  return (
    <section id="setup" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Get started"
          title="Three ways in — pick one, or use all three"
          subtitle="Each installs independently — the app and the CLI are fully standalone (the extension's live status bar pairs with the app). If you use more than one, they share the same local data under ~/.veyr/, so spend is consistent no matter which surface you open."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          <InstallCard
            icon={Monitor}
            label="macOS menu bar app"
            title="Veyr for macOS"
            steps={macSteps}
            cta={{ href: MAC_DMG_URL, label: `Download Veyr-${VEYR_VERSION}.dmg`, download: true }}
            accent={ACCENTS[0]}
            footnote={<CopyCodeBlock code="brew install --cask hethb/veyr/veyr" />}
          />
          <InstallCard
            icon={Code2}
            label="VS Code extension"
            title="Veyr for VS Code"
            steps={vscodeSteps}
            cta={{ href: VSIX_URL, label: "Download veyr-vscode-0.2.1.vsix", download: true }}
            accent={ACCENTS[1]}
          />
          <InstallCard
            icon={Terminal}
            label="CLI"
            title="Veyr CLI"
            steps={cliSteps}
            cta={{ href: "https://www.npmjs.com/package/getcanopy", label: "View on npm", external: true }}
            accent={ACCENTS[2]}
          />
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
    <>
      Veyr automatically installs{" "}
      <a
        href="https://github.com/Graphify-Labs/graphify"
        className="text-neutral-300 underline decoration-neutral-600 underline-offset-2 hover:text-white"
      >
        Graphify
      </a>{" "}
      (a Python package, pinned to an audited commit) on first launch to enable
      codebase graph analysis. It runs entirely locally — pure AST parsing, no
      LLM calls, no code leaves your machine. See the README for how to manage
      or disable it.
    </>,
    <>
      macOS may prompt for Full Disk Access or Keychain access — both are
      optional, used only to read browser cookies for web-based providers or
      OAuth credentials, and both can be scoped to Veyr alone or disabled
      entirely in Settings → Advanced. No Screen Recording, no Accessibility,
      ever. No passwords stored.{" "}
      <a
        href="https://github.com/hethb/Veyr#macos-permissions"
        target="_blank"
        rel="noreferrer"
        className="text-neutral-300 underline decoration-neutral-600 underline-offset-2 hover:text-white"
      >
        Full breakdown in the README
      </a>
      .
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

function ComparisonSection() {
  const rows: [string, string, string][] = [
    ["How it sees your usage", "Sits in the request path — you point ANTHROPIC_BASE_URL at it", "Reads session logs already on disk"],
    ["Setup", "API key + base-URL swap, often an account", "Download and open — no account or key required for spend visibility"],
    ["Your traffic", "Passes through their infrastructure", "Never touches it"],
    ["What you get back", "Logs of what happened", "Spend and a codebase map fed into your agent's own context"],
  ];

  return (
    <section id="compare" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="How this is different"
          title="Not another gateway"
          subtitle="Helicone, LiteLLM, and similar tools all work the same way: they sit in the request path. Veyr doesn't sit anywhere."
        />
        <div className="mt-10 overflow-hidden border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-xs uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3 text-left font-medium"></th>
                <th className="px-5 py-3 text-left font-medium">Gateway / proxy tools</th>
                <th className="px-5 py-3 text-left font-medium text-[#4FABFF]">Veyr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map(([label, them, us]) => (
                <tr key={label}>
                  <td className="px-5 py-4 font-medium text-white">{label}</td>
                  <td className="px-5 py-4 text-neutral-500">{them}</td>
                  <td className="px-5 py-4 text-[#B1C5FF]">{us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function UsageSection() {
  const gauges: Array<[string, number, string]> = [
    ["Claude Code", 62, "resets in 3h 12m"],
    ["Codex", 28, "resets in 1h 47m"],
    ["Cursor", 91, "weekly cap · resets Mon"],
  ];
  return (
    <section id="usage" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Usage & rate limits"
          title="Every provider, one place — before you hit a wall, not after"
          subtitle="Veyr reads local session logs and, where a provider exposes it, live rate-limit data. No proxy, no API key needed just to see where you stand."
        />
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
          <div className="border border-white/10 bg-white/[0.02] p-6">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-neutral-500">
              Rate-limit windows
            </p>
            <ul className="mt-5 space-y-5">
              {gauges.map(([name, percent, reset]) => (
                <li key={name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-white">{name}</span>
                    <span className="text-neutral-500">{reset}</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#4FABFF]"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <ul className="space-y-5">
              {[
                [
                  "Every provider, one place",
                  "Claude Code, Codex, and 50+ other coding-agent providers, read from local session logs — for Codex, straight from its own local RPC, not scraped or guessed.",
                ],
                [
                  "Rate-limit windows, not just totals",
                  "Session resets, weekly caps, and regen percentages tracked per provider, so you get a warning before you hit a wall instead of after.",
                ],
                [
                  "Same number everywhere",
                  "The menu bar app, VS Code status bar, and veyr status all read the same local data — never a proxy in between.",
                ],
              ].map(([title, body]) => (
                <li key={title} className="flex gap-4">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#4FABFF]" />
                  <div>
                    <h3 className="text-sm font-semibold text-white">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <CopyCodeBlock code="veyr status" className="mt-8 max-w-xs" />
          </div>
        </div>
      </div>
    </section>
  );
}

function GraphSection() {
  return (
    <section id="graph" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Codebase graph"
          title="Your agent stops exploring and starts knowing"
          subtitle="Veyr builds a knowledge graph of your codebase locally — powered by Graphify — and hands your agent a 400-token map instead of a 40-file reading list. This is the real graph renderer, not a screenshot — try it below."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-3">
          {[
            ["Built on your machine", "Pure AST parsing via Graphify — pinned install, zero LLM calls, no code leaves your device."],
            ["Injected where agents look", "The graph summary lands in CLAUDE.md and VEYR_STATUS.json: architecture, the active file's callers and callees, the critical path."],
            ["Structurally aware suggestions", "Leaf function on Opus, a god node, a redundant re-read, an unexplored dependency, high-connection code with no tests — five structural rules catch what spend data alone can't see."],
          ].map(([title, body]) => (
            <div key={title}>
              <h3 className="flex items-center gap-3 text-sm font-semibold text-white">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#4FABFF]" />
                {title}
              </h3>
              <p className="mt-1.5 pl-5 text-sm leading-relaxed text-neutral-500">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <GraphDemo />
        </div>
        <CopyCodeBlock code="veyr graph" className="mt-6 max-w-xs" />
      </div>
    </section>
  );
}

function DownloadSection() {
  return (
    <section id="download" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Download"
          title="Veyr on your machine"
          subtitle="Three surfaces, one local data store under ~/.veyr/. No proxy required, no server-side component."
        />
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col border border-white/10 p-8">
            <Monitor className="h-6 w-6 text-[#4FABFF]" />
            <h3 className="mt-4 text-lg font-semibold text-white">Veyr for macOS</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-400">
              Menu bar spend with a live-session pulse, spend dashboard, budget
              caps with notifications, the Graphify codebase graph, and the{" "}
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
              macOS 14+ · Apple Silicon &amp; Intel · v{VEYR_VERSION} · unsigned
              preview build — after installing, run{" "}
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
              cache hit rate, and codebase graph status — fed by the Mac
              app&apos;s local agent feed.
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

          <div className="flex flex-col border border-white/10 p-8">
            <Terminal className="h-6 w-6 text-[#4FABFF]" />
            <h3 className="mt-4 text-lg font-semibold text-white">Veyr CLI</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-400">
              Scriptable and CI-friendly. <code className="text-neutral-300">veyr status</code>{" "}
              and <code className="text-neutral-300">veyr graph</code> read the
              same local data as the other two surfaces.
            </p>
            <div id="cli-install" className="mt-6">
              <CopyCodeBlock code="npm install -g getcanopy" />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-neutral-600">
              Requires Node 20+. Package name is{" "}
              <code className="text-neutral-400">getcanopy</code> on npm; the
              binary is <code className="text-neutral-400">veyr</code>. Already
              installed?{" "}
              <code className="text-neutral-400">npm install -g getcanopy@latest</code>{" "}
              updates it — the CLI nudges you when a newer version is out.
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

      <div className="relative mx-auto max-w-3xl px-6 py-24 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
          Get started
        </p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Stop guessing what you&apos;re spending on.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-neutral-500">
          Download the app, install the extension, or run the CLI — all three
          read the same local data. No account, no seed command, nothing to
          configure.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#setup"
            className="inline-flex items-center gap-2 border border-white bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
          >
            Jump to setup
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href="https://github.com/hethb/Veyr"
            target="_blank"
            rel="noreferrer"
            className="border border-white/20 px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-[#4FABFF]/50 hover:bg-[#076EFF]/10"
          >
            View on GitHub
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
          <VeyrMark className="h-6 w-6" />
          <span className="flex items-center gap-1.5">
            Veyr v{VEYR_VERSION}
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
          <a href="#compare" className="transition-colors hover:text-white">
            Compare
          </a>
          <a
            href="https://github.com/hethb/Veyr"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-white"
          >
            GitHub
          </a>
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
