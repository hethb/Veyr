import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
  type Variants,
} from "framer-motion";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The five hue families of the floating background shapes, as a conic ring.
const RING_GRADIENT =
  "conic-gradient(from 0deg, #6366f1, #22d3ee, #8b5cf6, #f43f5e, #f59e0b, #6366f1)";

function ElegantShape({
  className,
  delay = 0,
  width = 400,
  height = 100,
  rotate = 0,
  gradient = "from-white/[0.08]",
  drift = 12,
  // How far (px) the shape shifts at full cursor deflection; bigger shapes
  // sit "closer" and move more, which is what sells the depth.
  depth = 20,
  mouseX,
  mouseY,
}: {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
  drift?: number;
  depth?: number;
  mouseX: MotionValue<number>;
  mouseY: MotionValue<number>;
}) {
  const parallaxX = useTransform(mouseX, (v) => v * depth);
  const parallaxY = useTransform(mouseY, (v) => v * depth);
  const parallaxTilt = useTransform(mouseX, (v) => v * depth * 0.08);

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
      <motion.div style={{ x: parallaxX, y: parallaxY, rotate: parallaxTilt }}>
        <motion.div
          animate={{ y: [0, drift, 0], x: [0, -drift / 3, 0] }}
          transition={{
            duration: 9 + drift * 0.4,
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
  const reduceMotion = useReducedMotion();

  // Cursor deflection from hero center, normalized to [-1, 1] on both axes.
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 45, damping: 18, mass: 0.6 });
  const smoothY = useSpring(mouseY, { stiffness: 45, damping: 18, mass: 0.6 });

  // Cursor position in % of the hero, for the light that follows the mouse.
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(40);
  const smoothSpotX = useSpring(spotX, { stiffness: 55, damping: 20 });
  const smoothSpotY = useSpring(spotY, { stiffness: 55, damping: 20 });
  const spotlight = useMotionTemplate`radial-gradient(640px circle at ${smoothSpotX}% ${smoothSpotY}%, rgba(79,171,255,0.09), rgba(255,255,255,0.03) 45%, transparent 70%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduceMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    mouseX.set(px * 2 - 1);
    mouseY.set(py * 2 - 1);
    spotX.set(px * 100);
    spotY.set(py * 100);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    spotX.set(50);
    spotY.set(40);
  };

  return (
    <div
      id="top"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
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
          drift={15}
          depth={36}
          mouseX={smoothX}
          mouseY={smoothY}
          className="left-[-10%] top-[15%] md:left-[-5%] md:top-[20%]"
        />
        <ElegantShape
          delay={0.5}
          width={500}
          height={120}
          rotate={-15}
          gradient="from-rose-500/[0.3]"
          drift={12}
          depth={28}
          mouseX={smoothX}
          mouseY={smoothY}
          className="right-[-5%] top-[70%] md:right-[0%] md:top-[75%]"
        />
        <ElegantShape
          delay={0.4}
          width={300}
          height={80}
          rotate={-8}
          gradient="from-violet-500/[0.3]"
          drift={10}
          depth={-18}
          mouseX={smoothX}
          mouseY={smoothY}
          className="bottom-[5%] left-[5%] md:bottom-[10%] md:left-[10%]"
        />
        <ElegantShape
          delay={0.6}
          width={200}
          height={60}
          rotate={20}
          gradient="from-amber-500/[0.3]"
          drift={8}
          depth={-12}
          mouseX={smoothX}
          mouseY={smoothY}
          className="right-[15%] top-[10%] md:right-[20%] md:top-[15%]"
        />
        <ElegantShape
          delay={0.7}
          width={150}
          height={40}
          rotate={-25}
          gradient="from-cyan-500/[0.3]"
          drift={7}
          depth={-8}
          mouseX={smoothX}
          mouseY={smoothY}
          className="left-[20%] top-[5%] md:left-[25%] md:top-[10%]"
        />
      </div>

      {/* Soft light that trails the cursor, shading whatever it passes over. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: spotlight }}
      />

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
              disk and builds a local map of your codebase. No account, no
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
            <a href="#setup" className="group relative inline-flex">
              {/* Soft moving halo behind the ring. */}
              <span
                aria-hidden
                className="absolute -inset-1 overflow-hidden rounded-full opacity-40 blur-md transition-opacity duration-300 group-hover:opacity-70"
              >
                <motion.span
                  className="absolute inset-[-200%]"
                  style={{ background: RING_GRADIENT }}
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={{
                    duration: 6,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear",
                  }}
                />
              </span>
              {/* 1px multicolor ring: rotating conic gradient clipped to a pill. */}
              <span className="relative overflow-hidden rounded-full p-px">
                <motion.span
                  aria-hidden
                  className="absolute inset-[-200%]"
                  style={{ background: RING_GRADIENT }}
                  animate={reduceMotion ? undefined : { rotate: 360 }}
                  transition={{
                    duration: 6,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "linear",
                  }}
                />
                <span className="relative z-10 inline-flex items-center gap-2 rounded-full bg-[#050506] px-8 py-3 text-sm font-semibold text-white transition-colors duration-300 group-hover:bg-[#0d0d10]">
                  Get started
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </span>
              </span>
            </a>
            <p className="text-xs text-neutral-500">
              No proxy. No account. No traffic interception.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#030303]/80 via-transparent to-[#030303]/50" />
    </div>
  );
}
