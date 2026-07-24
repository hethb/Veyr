import { Hero } from "@/components/ui/animated-shader-hero";

function scrollToSetup() {
  document.getElementById("setup")?.scrollIntoView({ behavior: "smooth" });
}

export function HeroSection() {
  return (
    <div id="top">
      <Hero
        headline={{
          line1: "Know what your coding agent is spending.",
          line2: "No proxy in the middle.",
        }}
        subtitle="Veyr reads Claude Code and Codex session logs straight off your disk and builds a local map of your codebase. No account, no traffic interception, nothing leaves your machine."
        buttons={{
          primary: { text: "Get started", onClick: scrollToSetup },
        }}
      />
    </div>
  );
}
