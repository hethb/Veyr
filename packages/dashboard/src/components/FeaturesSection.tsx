import {
  Bell,
  Bot,
  DollarSign,
  Route,
  Sparkles,
  TrendingUp,
  Waypoints,
} from "lucide-react";
import DisplayCards from "@/components/ui/display-cards";

const FEATURE_CARDS = [
  {
    icon: <DollarSign className="size-4 text-[#B1C5FF]" />,
    title: "Menu bar spend",
    description: "Live cost, plus rate-limit resets per provider",
    date: "Live",
    titleClassName: "text-[#076EFF]",
  },
  {
    icon: <Waypoints className="size-4 text-[#B1C5FF]" />,
    title: "Codebase graph",
    description: "A 400-token map instead of 40 files to explore",
    date: "Live",
    titleClassName: "text-[#4FABFF]",
  },
  {
    icon: <Bot className="size-4 text-[#B1C5FF]" />,
    title: "Agent feed",
    description: "VEYR_STATUS.json — your agent reads its own burn rate",
    date: "Agent-native",
    titleClassName: "text-[#B1C5FF]",
  },
];

interface FeatureDetail {
  icon: typeof DollarSign;
  title: string;
  body: string;
  /** Present only for not-yet-default-visible features. */
  status?: string;
}

const FEATURE_DETAILS: FeatureDetail[] = [
  {
    icon: DollarSign,
    title: "Multi-provider usage & rate limits",
    body: "Where your coding-agent spend is actually going — Claude Code, Codex, and 50+ other providers, read straight from local session logs, no proxy and no API key required. Rate-limit windows are tracked alongside spend: session resets, weekly caps, and regen percentages per provider, so you get a warning before you hit a wall instead of after. The menu bar app, VS Code status bar, and CLI (veyr status) all read the same local data, so the number is consistent everywhere you look.",
  },
  {
    icon: Waypoints,
    title: "Graphify codebase graph",
    body: "Veyr builds a knowledge graph of your repo locally — pure AST parsing via Graphify, no LLM calls, nothing leaves your device. It's a real call graph, not a file tree: critical-path ranking by structural connections, plus per-cursor context (callers, callees, related tests) for whatever you have open. An interactive force-directed view lets you explore it visually, and five structural rules flag leaf functions for cheap models, god nodes, redundant re-reads, and untested high-connection code before your agent finds out the hard way.",
  },
  {
    icon: Bot,
    title: "Guidance injection",
    body: "Veyr keeps a marker-delimited block in your project's CLAUDE.md steering the agent away from unverified claims, padded acknowledgments, and restating context it doesn't need to restate — applied by editing a file your agent already reads, not by intercepting a request. On by default, one click to disable.",
  },
  {
    icon: Route,
    title: "Right model for the right task",
    body: "Veyr spots projects where light work runs on frontier models — and with your own API key, an AI classifier rates every turn simple/moderate/complex and totals the cost wasted. Simple tasks shouldn't run on Opus; Veyr tells your agent when to switch.",
  },
  {
    icon: Bell,
    title: "Per-project budget caps",
    body: "Set a monthly cap for each project. Veyr alerts you at 80% and 100% via local notifications — no server round-trip. Your agent sees the budget status and adjusts its behavior accordingly.",
  },
  {
    icon: Sparkles,
    title: "Prompt autocomplete",
    body: "Learns your own prompting style from local session history, combines it with Graphify's understanding of the codebase, and suggests tighter phrasing as you type — naming the right file or symbol instead of describing it. Built, currently opt-in while we validate it in practice.",
    status: "Coming soon",
  },
  {
    icon: TrendingUp,
    title: "Savings tracker",
    body: "Estimated tokens and dollars saved — lifetime and per-project — from graph-guided context and other measured signals, broken down by how confident each estimate is, never one opaque total. Same numbers in the menu bar app, VS Code, and the CLI.",
    status: "Coming soon",
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-12">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
              Features
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your coding agent's spend and context — tracked, budgeted, fed back in.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-500">
              Most observability tools stop at totals. Veyr tells you{" "}
              <span className="text-neutral-300">where</span>,{" "}
              <span className="text-neutral-300">why</span>, and{" "}
              <span className="text-neutral-300">what to fix</span> — and puts
              that answer where it matters most: in your menu bar, in your
              editor, and in your agent&apos;s own context.
            </p>

            <ul className="mt-10 space-y-6">
              {FEATURE_DETAILS.map((item) => (
                <li key={item.title} className="flex gap-4">
                  <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center border border-white/10 bg-white/[0.03] text-[#4FABFF]">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                      {item.title}
                      {item.status && (
                        <span className="border border-[#f5a623]/50 bg-black px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#f5a623]">
                          {item.status}
                        </span>
                      )}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex min-h-[420px] items-center justify-center overflow-hidden py-8 lg:min-h-[480px] lg:py-0">
            <div className="origin-center scale-[0.78] sm:scale-90 lg:scale-100">
              <DisplayCards cards={FEATURE_CARDS} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
