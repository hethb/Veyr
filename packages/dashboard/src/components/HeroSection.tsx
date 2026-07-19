import { motion, type Variants } from "framer-motion";
import { ArrowRight, Code2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

function ElegantShape({
  className,
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = "from-white/[0.08]",
}: {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -150, rotate: rotate - 15 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{
        duration: 2.4,
        delay,
        ease: [0.23, 0.86, 0.39, 0.96],
        opacity: { duration: 1.2 },
      }}
      className={cn("absolute", className)}
    >
      <motion.div
        animate={{ y: [0, 15, 0] }}
        transition={{
          duration: 12,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
        style={{ width, height }}
        className="relative"
      >
        <div
          className={cn(
            "absolute inset-0 rounded-full",
            "bg-gradient-to-r to-transparent",
            gradient,
            "backdrop-blur-[2px] border-2 border-white/[0.25]",
            "shadow-[0_8px_32px_0_rgba(255,255,255,0.15)]",
            "after:absolute after:inset-0 after:rounded-full",
            "after:bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.3),transparent_70%)]"
          )}
        />
      </motion.div>
    </motion.div>
  );
}

const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 1,
      delay: 0.5 + i * 0.2,
      ease: [0.25, 0.4, 0.25, 1],
    },
  }),
};

export function HeroSection() {
  return (
    <div
      id="top"
      className="font-hero relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#030303]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] via-transparent to-rose-500/[0.05] blur-3xl" />

      <div className="absolute inset-0 overflow-hidden">
        <ElegantShape
          delay={0.3}
          width={600}
          height={140}
          rotate={12}
          gradient="from-indigo-500/[0.3]"
          className="left-[-10%] top-[15%] md:left-[-5%] md:top-[20%]"
        />
        <ElegantShape
          delay={0.5}
          width={500}
          height={120}
          rotate={-15}
          gradient="from-rose-500/[0.3]"
          className="right-[-5%] top-[70%] md:right-[0%] md:top-[75%]"
        />
        <ElegantShape
          delay={0.4}
          width={300}
          height={80}
          rotate={-8}
          gradient="from-violet-500/[0.3]"
          className="bottom-[5%] left-[5%] md:bottom-[10%] md:left-[10%]"
        />
        <ElegantShape
          delay={0.6}
          width={200}
          height={60}
          rotate={20}
          gradient="from-amber-500/[0.3]"
          className="right-[15%] top-[10%] md:right-[20%] md:top-[15%]"
        />
        <ElegantShape
          delay={0.7}
          width={150}
          height={40}
          rotate={-25}
          gradient="from-cyan-500/[0.3]"
          className="left-[20%] top-[5%] md:left-[25%] md:top-[10%]"
        />
      </div>

      <div className="container relative z-10 mx-auto px-4 md:px-6">
        <div className="mx-auto text-center">
          <motion.div
            custom={0}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
          >
            <h1 className="mb-6 text-4xl font-normal tracking-tight sm:text-5xl md:mb-8 md:text-6xl">
              <span className="bg-gradient-to-b from-white to-white/80 bg-clip-text text-transparent">
                Know what your coding agent is spending.
              </span>
              <br />
              <span className="bg-gradient-to-r from-indigo-300 via-white/90 to-rose-300 bg-clip-text text-transparent">
                No proxy in the middle.
              </span>
            </h1>
          </motion.div>

          <motion.div
            custom={1}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
          >
            <p className="mx-auto mb-8 max-w-xl px-4 text-base font-light leading-relaxed tracking-wide text-neutral-400 sm:text-lg md:text-xl">
              Veyr reads Claude Code and Codex session logs straight off your
              disk and builds a local map of your codebase — no account, no
              traffic interception, nothing leaves your machine.
            </p>
          </motion.div>

          <motion.div
            custom={2}
            variants={fadeUpVariants}
            initial="hidden"
            animate="visible"
            className="mx-auto flex flex-col items-center gap-3"
          >
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
          </motion.div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#030303]/80 via-transparent to-[#030303]/50" />
    </div>
  );
}
