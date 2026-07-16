import { useScroll, useTransform } from "framer-motion";
import { ArrowRight, Code2, Terminal } from "lucide-react";
import { useRef } from "react";
import { GoogleGeminiEffect } from "@/components/ui/google-gemini-effect";

export function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  const pathLengthFirst = useTransform(scrollYProgress, [0, 0.8], [0.2, 1.2]);
  const pathLengthSecond = useTransform(scrollYProgress, [0, 0.8], [0.15, 1.2]);
  const pathLengthThird = useTransform(scrollYProgress, [0, 0.8], [0.1, 1.2]);
  const pathLengthFourth = useTransform(scrollYProgress, [0, 0.8], [0.05, 1.2]);
  const pathLengthFifth = useTransform(scrollYProgress, [0, 0.8], [0, 1.2]);

  return (
    <div
      ref={ref}
      id="top"
      className="font-hero relative h-[400vh] w-full overflow-clip bg-black pt-32"
    >
      <GoogleGeminiEffect
        title="Know what your coding agent is spending. No proxy in the middle."
        description="Veyr reads Claude Code and Codex session logs straight off your disk and builds a local map of your codebase — no account, no traffic interception, nothing leaves your machine."
        pathLengths={[
          pathLengthFirst,
          pathLengthSecond,
          pathLengthThird,
          pathLengthFourth,
          pathLengthFifth,
        ]}
        cta={
          <div className="z-30 mx-auto mt-8 flex flex-col items-center gap-3 md:mt-24">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <a
                href="#setup"
                className="inline-flex items-center gap-2 border border-white bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
              >
                Download for Mac
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#setup"
                className="inline-flex items-center gap-2 border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-[#4FABFF]/50 hover:bg-[#076EFF]/10"
              >
                <Code2 className="h-4 w-4" />
                Install VS Code extension
              </a>
              <a
                href="#setup"
                className="inline-flex items-center gap-2 border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-[#4FABFF]/50 hover:bg-[#076EFF]/10"
              >
                <Terminal className="h-4 w-4" />
                Install the CLI
              </a>
            </div>
            <p className="text-xs text-neutral-500">
              No proxy. No account. No traffic interception. ·{" "}
              <a
                href="https://github.com/steipete/CodexBar"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-neutral-700 underline-offset-2 transition-colors hover:text-neutral-300"
              >
                Built on CodexBar
              </a>
            </p>
          </div>
        }
      />
    </div>
  );
}
