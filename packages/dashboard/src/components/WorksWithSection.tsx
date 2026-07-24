import { LogoCloud, type Logo } from "@/components/ui/logo-cloud";

const AGENT_LOGOS: Logo[] = [
  { src: "/logos/claude.svg", name: "Claude" },
  { src: "/logos/openai.svg", name: "GPT" },
  { src: "/logos/gemini.svg", name: "Gemini" },
  { src: "/logos/cursor.svg", name: "Cursor" },
  { src: "/logos/githubcopilot.svg", name: "Copilot" },
  { src: "/logos/groq.svg", name: "Groq" },
  { src: "/logos/droid.svg", name: "Droid" },
  { src: "/logos/opencode.svg", name: "Open Code" },
  { src: "/logos/antigravity.svg", name: "Antigravity" },
  { src: "/logos/augment.svg", name: "Augment" },
  { src: "/logos/ollama.svg", name: "Ollama" },
  { src: "/logos/perplexity.svg", name: "Perplexity" },
  { src: "/logos/jetbrains.svg", name: "JetBrains AI" },
  { src: "/logos/deepseek.svg", name: "DeepSeek" },
  { src: "/logos/elevenlabs.svg", name: "ElevenLabs" },
  { emoji: "🚅", name: "LiteLLM" },
];

export function WorksWithSection() {
  return (
    <section className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
          Works with the agents you already run. No new account, nothing to
          switch
        </p>
        <div className="mt-8">
          <LogoCloud logos={AGENT_LOGOS} />
        </div>
      </div>
    </section>
  );
}
