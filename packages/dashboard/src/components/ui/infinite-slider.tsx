import { cn } from "@/lib/utils";
import { useMotionValue, animate, motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import useMeasure from "react-use-measure";

export type InfiniteSliderProps = {
  children: React.ReactNode;
  gap?: number;
  speed?: number;
  speedOnHover?: number;
  direction?: "horizontal" | "vertical";
  reverse?: boolean;
  className?: string;
};

export function InfiniteSlider({
  children,
  gap = 16,
  speed = 100,
  speedOnHover,
  direction = "horizontal",
  reverse = false,
  className,
}: InfiniteSliderProps) {
  const [isHovering, setIsHovering] = useState(false);
  const currentSpeed = isHovering && speedOnHover ? speedOnHover : speed;
  const [ref, { width, height }] = useMeasure();
  const translation = useMotionValue(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    const size = direction === "horizontal" ? width : height;
    if (!size) return;

    const contentSize = size + gap;
    const from = reverse ? -contentSize / 2 : 0;
    const to = reverse ? 0 : -contentSize / 2;
    const distanceToTravel = Math.abs(to - from);
    const duration = distanceToTravel / currentSpeed;

    const startLoop = () =>
      animate(translation, [from, to], {
        ease: "linear",
        duration,
        repeat: Infinity,
        repeatType: "loop",
        repeatDelay: 0,
        onRepeat: () => {
          translation.set(from);
        },
      });

    let controls: ReturnType<typeof animate>;

    if (!hasStarted.current) {
      // First real measurement — nothing is playing yet, so it's safe to
      // set the starting position directly.
      hasStarted.current = true;
      controls = startLoop();
    } else {
      // Every later re-run (hover speed change, or the measured width
      // settling once images/the webfont finish loading) glides from
      // wherever the track currently sits to the recalculated end point,
      // instead of snapping straight to `from`. Snapping is what caused
      // the visible seam: it discarded the current scroll position and
      // jumped to a fresh start every time width/height changed.
      const remainingDistance = Math.abs(translation.get() - to);
      const transitionDuration = remainingDistance / currentSpeed;

      controls = animate(translation, [translation.get(), to], {
        ease: "linear",
        duration: transitionDuration,
        onComplete: () => {
          controls = startLoop();
        },
      });
    }

    return () => controls?.stop();
  }, [translation, currentSpeed, width, height, gap, direction, reverse]);

  const hoverProps = speedOnHover
    ? {
        onHoverStart: () => setIsHovering(true),
        onHoverEnd: () => setIsHovering(false),
      }
    : {};

  return (
    <div className={cn("overflow-hidden", className)}>
      <motion.div
        className="flex w-max"
        style={{
          ...(direction === "horizontal"
            ? { x: translation }
            : { y: translation }),
          gap: `${gap}px`,
          flexDirection: direction === "horizontal" ? "row" : "column",
        }}
        ref={ref}
        {...hoverProps}
      >
        {children}
        {children}
      </motion.div>
    </div>
  );
}
