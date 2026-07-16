import { type ReactNode } from "react";
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
  Waypoints,
  Zap,
} from "lucide-react";
import { CopyCodeBlock } from "../components/CopyCodeBlock";
import { FeaturesSection } from "../components/FeaturesSection";
import { HeroSection } from "../components/HeroSection";
import { NavBar } from "@/components/ui/tubelight-navbar";

const LANDING_NAV_ITEMS = [
  { name: "Home", url: "#top", icon: Home },
  { name: "How it works", url: "#how", icon: Zap },
  { name: "Setup", url: "#setup", icon: Terminal },
  { name: "Features", url: "#features", icon: Layers },
  { name: "Graph", url: "#graph", icon: Waypoints },
  { name: "Compare", url: "#compare", icon: BarChart3 },
  { name: "Download", url: "#download", icon: Monitor },
] as const;

const ACCENTS = ["#076EFF", "#4FABFF", "#B1C5FF"] as const;
const VEYR_VERSION = "0.2.2";
const MAC_DMG_URL = `/downloads/Veyr-${VEYR_VERSION}.dmg`;
const VSIX_URL = "/downloads/veyr-vscode-0.2.1.vsix";

export function Landing() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <HeroSection />
      <HowItWorks />
      <GetRunning />
      <PrivacySection />
      <ComparisonSection />
      <FeaturesSection />
      <GraphSection />
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
            className="border border-white bg-white px-3 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
          >
            Download
          </a>
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
    { title: "Install", detail: "Requires Node 20+.", code: "npm install -g getcanopy" },
    { title: "Or via Homebrew", code: "brew install hethb/veyr/veyr" },
    { title: "Check your spend", code: "veyr status" },
    { title: "See the codebase graph", code: "veyr graph" },
  ];

  return (
    <section id="setup" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Get started"
          title="Three ways in — pick one, or use all three"
          subtitle="They read the same local data under ~/.veyr/, so spend is consistent no matter which surface you open."
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

function GraphSection() {
  const nodes: Array<[number, number, number, string, boolean]> = [
    [200, 130, 16, "#16A34A", true],
    [110, 70, 11, "#2563EB", false],
    [300, 75, 12, "#7C3AED", true],
    [70, 170, 9, "#16A34A", false],
    [150, 225, 10, "#2563EB", false],
    [265, 210, 9, "#16A34A", false],
    [340, 160, 10, "#2563EB", false],
    [235, 30, 8, "#16A34A", false],
    [45, 110, 7, "#7C3AED", false],
  ];
  const edges: Array<[number, number, string]> = [
    [1, 0, "#3B82F6"], [2, 0, "#DB2777"], [3, 0, "#EA580C"], [4, 0, "#EA580C"],
    [5, 0, "#EA580C"], [6, 0, "#3B82F6"], [7, 2, "#EA580C"], [8, 1, "#3B82F6"],
    [4, 5, "#0D9488"],
  ];
  return (
    <section id="graph" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SectionHeader
          eyebrow="Codebase graph"
          title="Your agent stops exploring and starts knowing"
          subtitle="Veyr builds a knowledge graph of your codebase locally — powered by Graphify — and hands your agent a 400-token map instead of a 40-file reading list."
        />
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
          <svg
            viewBox="0 0 400 260"
            role="img"
            aria-label="Illustration of a codebase graph: files, functions and classes connected by call and import edges"
            className="mx-auto w-full max-w-md"
          >
            {edges.map(([from, to, color], i) => (
              <line
                key={i}
                x1={nodes[from][0]}
                y1={nodes[from][1]}
                x2={nodes[to][0]}
                y2={nodes[to][1]}
                stroke={color}
                strokeOpacity={0.45}
                strokeWidth={1.5}
              />
            ))}
            {nodes.map(([x, y, r, color, ring], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r={r + 3} fill="#000" />
                {ring && <circle cx={x} cy={y} r={r + 2.5} fill="#EAB308" />}
                <circle cx={x} cy={y} r={r} fill={color} />
              </g>
            ))}
            <text x="200" y="162" textAnchor="middle" fill="#c7ccd6" fontSize="11">
              refreshToken()
            </text>
            <text x="300" y="103" textAnchor="middle" fill="#8a8f99" fontSize="10">
              TokenStore
            </text>
          </svg>
          <div>
            <ul className="space-y-5">
              {[
                ["Built on your machine", "Pure AST parsing via Graphify — pinned install, zero LLM calls, no code leaves your device."],
                ["Injected where agents look", "The graph summary lands in CLAUDE.md and VEYR_STATUS.json: architecture, the active file's callers and callees, the critical path."],
                ["Structurally aware suggestions", "Leaf function on Opus? God node with no tests? Veyr's graph rules catch what spend data alone can't see."],
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
            <CopyCodeBlock code="veyr graph" className="mt-8 max-w-xs" />
          </div>
        </div>
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
              binary is <code className="text-neutral-400">veyr</code>.
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
