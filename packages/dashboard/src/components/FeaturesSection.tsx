import {
  Database,
  FileText,
  Globe,
  Layers,
  Sparkles,
  Tags,
  Wand2,
  Zap,
} from "lucide-react";
import DisplayCards from "@/components/ui/display-cards";

const FEATURE_CARDS = [
  {
    icon: <Globe className="size-4 text-[#B1C5FF]" />,
    title: "Web chats captured",
    description: "chatgpt.com & claude.ai usage ingested live",
    date: "New",
    titleClassName: "text-[#076EFF]",
  },
  {
    icon: <Wand2 className="size-4 text-[#B1C5FF]" />,
    title: "Prompt Helper",
    description: "Paste a draft → get tighter phrasing instantly",
    date: "Pre-send",
    titleClassName: "text-[#4FABFF]",
  },
  {
    icon: <Database className="size-4 text-[#B1C5FF]" />,
    title: "Prompt caching",
    description: "Auto cache_control + 70–90% cheaper repeats",
    date: "Caching",
    titleClassName: "text-[#B1C5FF]",
  },
];

const FEATURE_DETAILS = [
  {
    icon: Globe,
    title: "Web-chat ingest (browser extension)",
    body: "Every send on chatgpt.com or claude.ai is intercepted in a Shadow-DOM widget. A MutationObserver waits for the assistant response to stabilize, then ingests prompt + completion tokens into your dashboard — tagged web-chatgpt or web-claude. The dashboard polls every 5 seconds, so web usage shows up alongside SDK and CLI traffic in the same charts.",
  },
  {
    icon: Wand2,
    title: "Pre-send Prompt Helper",
    body: "A rule-based linter (POST /api/analysis/prompt-lint) flags vague openers, missing constraints, bloated context, and chat-history bloat — then suggests a tighter template. Surfaced in the dashboard's Prompt Helper page and inline in the browser extension before you hit send.",
  },
  {
    icon: Database,
    title: "Prompt caching support",
    body: "Set x-promptlens-cache: 1 (or enable_prompt_caching on a feature policy) and the proxy injects Anthropic cache_control automatically. Cache hits, writes, and savings are tracked in a dedicated dashboard panel — and a caching suggestion fires when a long, repeated prompt has a low hit rate.",
  },
  {
    icon: FileText,
    title: "Document → Markdown converter",
    body: "POST /api/convert turns PDFs, Word docs, HTML, CSV, JSON, and XML into compact LLM-ready Markdown — typically 70–90% fewer input tokens than raw text. Inspired by Microsoft's MarkItDown; runs in-process, no external API.",
  },
  {
    icon: Tags,
    title: "Cost attribution by feature",
    body: "Auto-inferred from your request path or set via x-feature-tag. The dashboard breaks spend down per endpoint — /api/summarize, /api/chat — with no manual tagging or SDK rewrite.",
  },
  {
    icon: Sparkles,
    title: "Actionable optimization rules",
    body: "Seven post-hoc rules analyze your last 30 days — expensive model on simple feature, ballooning completions, error-burning tokens, dominating spend, redundant templates, low cache efficiency, and a quick-win flag on the highest-impact item.",
  },
  {
    icon: Layers,
    title: "Desktop app & VSCode panel",
    body: "Electron app auto-starts the proxy, opens the dashboard natively, and shows today's spend in your menu bar. VSCode extension adds a Veyr panel + a one-click command to route Claude Code through the proxy.",
  },
  {
    icon: Zap,
    title: "Per-request logging",
    body: "Every OpenAI and Anthropic call is logged with model, token counts, latency, cache hits, and computed cost. Filter by time range, feature, or template to find outliers fast — all stored locally in SQLite by default.",
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
              Every surface where you use LLMs — captured, costed, optimized.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-500">
              Most observability tools stop at totals. Veyr tells you{" "}
              <span className="text-neutral-300">where</span>,{" "}
              <span className="text-neutral-300">why</span>, and{" "}
              <span className="text-neutral-300">what to fix</span> — from your
              production API traffic to chatgpt.com tabs to your CLI agents,
              all in one dashboard.
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
