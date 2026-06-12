import { useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { GoogleGeminiEffect } from "@/components/ui/google-gemini-effect";

interface HeroSectionProps {
  /** When true, the primary CTA points at the email sign-up form. */
  authEnabled: boolean;
}

export function HeroSection({ authEnabled }: HeroSectionProps) {
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
      className="relative h-[400vh] w-full overflow-clip bg-black pt-32"
    >
      <GoogleGeminiEffect
        title="The LLM spend management layer"
        description="Point your API at Canopy. See which features burn money — then compress prompts and enforce budgets from the same proxy. Helicone shows what happened; Canopy changes what happens."
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
              {authEnabled ? (
                <a
                  href="#get-started"
                  className="inline-flex items-center gap-2 border border-white bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </a>
              ) : (
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 border border-white bg-white px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
                >
                  Open dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
              <a
                href="#demo"
                className="inline-flex items-center gap-2 border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:border-[#4FABFF]/50 hover:bg-[#076EFF]/10"
              >
                See live demo
                <ArrowDown className="h-4 w-4" />
              </a>
            </div>
            <p className="text-xs text-neutral-500">
              npm install canopy-sdk — one env var, two lines of code
            </p>
          </div>
        }
      />
    </div>
  );
}
