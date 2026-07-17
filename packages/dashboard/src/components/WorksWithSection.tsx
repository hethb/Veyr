import { LogoCloud, type Logo } from "@/components/ui/logo-cloud";

const AGENT_LOGOS: Logo[] = [
  { src: "/logos/claude.svg", alt: "Claude" },
  { src: "/logos/openai.svg", alt: "OpenAI / GPT" },
  { src: "/logos/gemini.svg", alt: "Gemini" },
  { src: "/logos/cursor.svg", alt: "Cursor" },
  { src: "/logos/githubcopilot.svg", alt: "GitHub Copilot" },
  { src: "/logos/groq.svg", alt: "Groq" },
  { src: "/logos/droid.svg", alt: "Droid" },
];

export function WorksWithSection() {
  return (
    <section className="border-t border-white/10 bg-black">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
          Works with the agents you already run — no new account, nothing to
          switch
        </p>
        <div className="mt-8">
          <LogoCloud logos={AGENT_LOGOS} />
        </div>
      </div>
    </section>
  );
}
