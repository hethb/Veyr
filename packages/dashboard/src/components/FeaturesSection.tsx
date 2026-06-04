import {
  FileText,
  GitBranch,
  Layers,
  Sparkles,
  Tags,
} from "lucide-react";
import DisplayCards from "@/components/ui/display-cards";

const FEATURE_CARDS = [
  {
    icon: <Tags className="size-4 text-[#B1C5FF]" />,
    title: "Feature attribution",
    description: "Costs mapped to the API route that sent them",
    date: "Zero manual tagging",
    titleClassName: "text-[#076EFF]",
  },
  {
    icon: <FileText className="size-4 text-[#B1C5FF]" />,
    title: "Prompt templates",
    description: "Rank prompt hashes by total spend and volume",
    date: "First-class visibility",
    titleClassName: "text-[#4FABFF]",
  },
  {
    icon: <Sparkles className="size-4 text-[#B1C5FF]" />,
    title: "Optimization hints",
    description: "Spot bloated prompts before they drain budget",
    date: "Actionable savings",
    titleClassName: "text-[#B1C5FF]",
  },
];

const FEATURE_DETAILS = [
  {
    icon: GitBranch,
    title: "Auto-inferred feature tags",
    body: "PromptLens reads your request path and attaches a feature tag to every call. Your dashboard breaks spend down by endpoint — /api/summarize, /api/chat, /internal/rag — without custom headers or SDK changes.",
  },
  {
    icon: FileText,
    title: "Prompt template leaderboard",
    body: "Each unique prompt is hashed and tracked over time. See which templates drive the most cost, how token usage trends, and which features rely on expensive prompts.",
  },
  {
    icon: Layers,
    title: "Per-request cost logging",
    body: "Every OpenAI and Anthropic call is logged with model, token counts, and computed cost. Filter by time range, feature, or template to find outliers fast.",
  },
  {
    icon: Sparkles,
    title: "Compression suggestions",
    body: "PromptLens flags prompts that could be shortened without losing quality. Cut token waste before it shows up on your invoice.",
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
              A deeper look at what PromptLens tracks
            </h2>
            <p className="mt-4 text-base leading-relaxed text-neutral-500">
              Most observability tools stop at totals. PromptLens tells you{" "}
              <span className="text-neutral-300">where</span>,{" "}
              <span className="text-neutral-300">why</span>, and{" "}
              <span className="text-neutral-300">what to fix</span> — all from
              a drop-in proxy with no agent in your request path.
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
