import { useEffect } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

type GradientDotsProps = React.ComponentProps<typeof motion.div> & {
  dotSize?: number;
  spacing?: number;
  /** Slow ambient drift duration (default: 48) */
  duration?: number;
  backgroundColor?: string;
  /** How strongly the glow follows the cursor, 0–1 (default: 0.35) */
  mouseInfluence?: number;
};

export function GradientDots({
  dotSize = 10,
  spacing = 12,
  duration = 48,
  backgroundColor = "#000000",
  mouseInfluence = 0.35,
  className,
  ...props
}: GradientDotsProps) {
  const hexSpacing = spacing * 1.732;

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const springX = useSpring(mouseX, { stiffness: 40, damping: 22, mass: 0.8 });
  const springY = useSpring(mouseY, { stiffness: 40, damping: 22, mass: 0.8 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseX.set(e.clientX / window.innerWidth);
      mouseY.set(e.clientY / window.innerHeight);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mouseX, mouseY]);

  const influence = mouseInfluence * 100;

  const glow1X = useTransform(springX, (v) => `${(v - 0.5) * influence + 50}%`);
  const glow1Y = useTransform(springY, (v) => `${(v - 0.5) * influence + 50}%`);
  const glow2X = useTransform(springX, (v) => `${(0.5 - v) * influence * 0.6 + 35}%`);
  const glow2Y = useTransform(springY, (v) => `${(0.5 - v) * influence * 0.6 + 65}%`);
  const glow3X = useTransform(springX, (v) => `${(v - 0.3) * influence * 0.4 + 70}%`);
  const glow3Y = useTransform(springY, (v) => `${(v - 0.7) * influence * 0.4 + 30}%`);

  const backgroundImage = useMotionTemplate`
    radial-gradient(circle at 50% 50%, transparent 1.5px, ${backgroundColor} 0 ${dotSize}px, transparent ${dotSize}px),
    radial-gradient(circle at 50% 50%, transparent 1.5px, ${backgroundColor} 0 ${dotSize}px, transparent ${dotSize}px),
    radial-gradient(circle at ${glow1X} ${glow1Y}, rgba(7, 110, 255, 0.14) 0%, transparent 55%),
    radial-gradient(circle at ${glow2X} ${glow2Y}, rgba(79, 171, 255, 0.1) 0%, transparent 50%),
    radial-gradient(ellipse at ${glow3X} ${glow3Y}, rgba(177, 197, 255, 0.07) 0%, transparent 60%)
  `;

  return (
    <motion.div
      className={cn("absolute inset-0", className)}
      style={{
        backgroundColor,
        backgroundImage,
        backgroundSize: `
          ${spacing}px ${hexSpacing}px,
          ${spacing}px ${hexSpacing}px,
          180% 180%,
          160% 160%,
          200% 200%
        `,
      }}
      animate={{
        backgroundPosition: [
          `0px 0px, ${spacing / 2}px ${hexSpacing / 2}px, 0% 0%, 0% 0%, 0% 0%`,
          `0px 0px, ${spacing / 2}px ${hexSpacing / 2}px, 15% 8%, -10% 12%, 8% -6%`,
          `0px 0px, ${spacing / 2}px ${hexSpacing / 2}px, 0% 0%, 0% 0%, 0% 0%`,
        ],
      }}
      transition={{
        backgroundPosition: {
          duration,
          ease: "linear",
          repeat: Number.POSITIVE_INFINITY,
        },
      }}
      {...props}
    />
  );
}
