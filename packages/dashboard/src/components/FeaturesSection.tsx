import {
  Bell,
  Bot,
  Code2,
  Database,
  DollarSign,
  Route,
  Waypoints,
} from "lucide-react";
import DisplayCards from "@/components/ui/display-cards";

const FEATURE_CARDS = [
  {
    icon: <DollarSign className="size-4 text-[#B1C5FF]" />,
    title: "Menu bar spend",
    description: "Today's cost with a live-session pulse",
    date: "Live",
    titleClassName: "text-[#076EFF]",
  },
  {
    icon: <Bot className="size-4 text-[#B1C5FF]" />,
    title: "Agent feed",
    description: "VEYR_STATUS.json — your agent reads its own burn rate",
    date: "Agent-native",
    titleClassName: "text-[#4FABFF]",
  },
  {
    icon: <Bell className="size-4 text-[#B1C5FF]" />,
    title: "Budget caps",
    description: "Per-project caps with 80% / 100% alerts",
    date: "Controls",
    titleClassName: "text-[#B1C5FF]",
  },
];

const FEATURE_DETAILS = [
  {
    icon: DollarSign,
    title: "Real-time spend in your menu bar",
    body: "Today's cost, this week, this month. See which project is burning the most and which model is responsible — at a glance, without opening a dashboard.",
  },
  {
    icon: Bot,
    title: "Optimization your agent reads and acts on",
    body: "Veyr writes a spend status block into your CLAUDE.md (on by default, one click to disable). When you open Claude Code, it already knows its burn rate, budget status, and what to do differently — no manual input from you.",
  },
  {
    icon: Route,
    title: "Right model for the right task",
    body: "Veyr spots projects where light work runs on frontier models — and with your API key, an AI classifier rates every turn simple/moderate/complex and totals the cost wasted. Simple tasks shouldn't run on Opus; Veyr tells your agent when to switch.",
  },
  {
    icon: Database,
    title: "Prompt caching insights",
    body: "Veyr tracks your cache hit rate per project and flags where caching isn't working. Route API traffic through the optional Veyr proxy and it can inject Anthropic cache_control headers automatically — repeated turns cost up to 90% less.",
  },
  {
    icon: Bell,
    title: "Per-project budget caps",
    body: "Set a monthly cap for each project. Veyr alerts you at 80% and 100% via macOS notifications. Your agent sees the budget status and adjusts its behavior accordingly.",
  },
  {
    icon: Waypoints,
    title: "A codebase graph your agent navigates",
    body: "Veyr builds a Graphify-powered knowledge graph of your repo — locally, pure AST, no LLM calls. Your agent reads a 400-token structural summary instead of exploring 40 files, and Veyr's suggestions become structurally aware: leaf functions get cheap models, god nodes get a warning.",
  },
  {
    icon: Code2,
    title: "Live cost in your editor",
    body: "The Veyr VS Code extension shows current session cost in the status bar and surfaces the top optimization suggestion in its panel with a one-click copy — without leaving your editor.",
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
              Your coding agent's spend — tracked, budgeted, optimized.
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
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
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
