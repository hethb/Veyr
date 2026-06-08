import { useEffect } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { cn } from "@/lib/utils";

type GradientDotsProps = React.ComponentProps<typeof motion.div> & {
  dotSize?: number;
  spacing?: number;
  backgroundColor?: string;
  /** Radius of the cursor highlight in px (default: 220) */
  spotlightRadius?: number;
};

function dotGrid(dotColor: string, dotSize: number) {
  return `
    radial-gradient(circle at 50% 50%, ${dotColor} 0 ${dotSize}px, transparent ${dotSize}px),
    radial-gradient(circle at 50% 50%, ${dotColor} 0 ${dotSize}px, transparent ${dotSize}px)
  `;
}

export function GradientDots({
  dotSize = 1.6,
  spacing = 20,
  backgroundColor = "#0a0b10",
  spotlightRadius = 240,
  className,
  ...props
}: GradientDotsProps) {
  const hexSpacing = spacing * 1.732;
  const gridSize = `${spacing}px ${hexSpacing}px`;
  const gridOffset = `0px 0px, ${spacing / 2}px ${hexSpacing / 2}px`;

  const mouseX = useMotionValue(
    typeof window !== "undefined" ? window.innerWidth / 2 : 0
  );
  const mouseY = useMotionValue(
    typeof window !== "undefined" ? window.innerHeight / 2 : 0
  );
  const cursorX = useSpring(mouseX, { stiffness: 120, damping: 24, mass: 0.4 });
  const cursorY = useSpring(mouseY, { stiffness: 120, damping: 24, mass: 0.4 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mouseX, mouseY]);

  const spotlightMask = useMotionTemplate`radial-gradient(circle ${spotlightRadius}px at ${cursorX}px ${cursorY}px, black 0%, rgba(0,0,0,0.55) 45%, transparent 100%)`;

  const cursorGlow = useMotionTemplate`radial-gradient(circle ${spotlightRadius * 1.4}px at ${cursorX}px ${cursorY}px, rgba(79, 130, 230, 0.06) 0%, rgba(120, 160, 230, 0.025) 45%, transparent 70%)`;

  const hotspotMask = useMotionTemplate`radial-gradient(circle ${spotlightRadius * 0.34}px at ${cursorX}px ${cursorY}px, black 0%, transparent 100%)`;

  // Calm, low-contrast dots that sit quietly behind the content. The cursor
  // gently lifts them rather than flashing bright white.
  const baseDots = dotGrid("rgba(140, 165, 210, 0.07)", dotSize);
  const litDots = dotGrid("rgba(160, 185, 235, 0.26)", dotSize);
  const hotDots = dotGrid("rgba(200, 215, 245, 0.16)", dotSize * 0.85);

  return (
    <motion.div
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{ backgroundColor }}
      {...props}
    >
      {/* Always-visible dot grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: baseDots,
          backgroundSize: gridSize,
          backgroundPosition: gridOffset,
        }}
      />

      {/* Brighter dots revealed near the cursor */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: litDots,
          backgroundSize: gridSize,
          backgroundPosition: gridOffset,
          maskImage: spotlightMask,
          WebkitMaskImage: spotlightMask,
        }}
      />

      {/* Core hotspot — brightest dots at cursor */}
      <motion.div
        className="absolute inset-0"
        style={{
          backgroundImage: hotDots,
          backgroundSize: gridSize,
          backgroundPosition: gridOffset,
          maskImage: hotspotMask,
          WebkitMaskImage: hotspotMask,
        }}
      />

      {/* Soft blue wash following the cursor */}
      <motion.div
        className="absolute inset-0"
        style={{ backgroundImage: cursorGlow }}
      />
    </motion.div>
  );
}
