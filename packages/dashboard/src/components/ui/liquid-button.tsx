import { AnimatePresence, motion } from "framer-motion";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ColorKey =
  | "color1"
  | "color2"
  | "color3"
  | "color4"
  | "color5"
  | "color6"
  | "color7"
  | "color8"
  | "color9"
  | "color10"
  | "color11"
  | "color12"
  | "color13"
  | "color14"
  | "color15"
  | "color16"
  | "color17";

export type Colors = Record<ColorKey, string>;

const svgOrder = [
  "svg1",
  "svg2",
  "svg3",
  "svg4",
  "svg3",
  "svg2",
  "svg1",
] as const;

type SvgKey = (typeof svgOrder)[number];

type Stop = {
  offset: number;
  stopColor: string;
};

type SvgState = {
  gradientTransform: string;
  stops: Stop[];
};

type SvgStates = Record<SvgKey, SvgState>;

const createStopsArray = (
  svgStates: SvgStates,
  order: readonly SvgKey[],
  maxStops: number
): Stop[][] => {
  const stopsArray: Stop[][] = [];
  for (let i = 0; i < maxStops; i++) {
    const stopConfigurations = order.map((svgKey) => {
      const svg = svgStates[svgKey];
      return svg.stops[i] || svg.stops[svg.stops.length - 1];
    });
    stopsArray.push(stopConfigurations);
  }
  return stopsArray;
};

type GradientSvgProps = {
  className: string;
  isHovered: boolean;
  colors: Colors;
};

const GradientSvg: React.FC<GradientSvgProps> = ({
  className,
  isHovered,
  colors,
}) => {
  const svgStates: SvgStates = {
    svg1: {
      gradientTransform:
        "translate(287.5 280) rotate(-29.0546) scale(689.807 1000)",
      stops: [
        { offset: 0, stopColor: colors.color1 },
        { offset: 0.188423, stopColor: colors.color2 },
        { offset: 0.260417, stopColor: colors.color3 },
        { offset: 0.328792, stopColor: colors.color4 },
        { offset: 0.328892, stopColor: colors.color5 },
        { offset: 0.328992, stopColor: colors.color1 },
        { offset: 0.442708, stopColor: colors.color6 },
        { offset: 0.537556, stopColor: colors.color7 },
        { offset: 0.631738, stopColor: colors.color1 },
        { offset: 0.725645, stopColor: colors.color8 },
        { offset: 0.817779, stopColor: colors.color9 },
        { offset: 0.84375, stopColor: colors.color10 },
        { offset: 0.90569, stopColor: colors.color1 },
        { offset: 1, stopColor: colors.color11 },
      ],
    },
    svg2: {
      gradientTransform:
        "translate(126.5 418.5) rotate(-64.756) scale(533.444 773.324)",
      stops: [
        { offset: 0, stopColor: colors.color1 },
        { offset: 0.104167, stopColor: colors.color12 },
        { offset: 0.182292, stopColor: colors.color13 },
        { offset: 0.28125, stopColor: colors.color1 },
        { offset: 0.328792, stopColor: colors.color4 },
        { offset: 0.328892, stopColor: colors.color5 },
        { offset: 0.453125, stopColor: colors.color6 },
        { offset: 0.515625, stopColor: colors.color7 },
        { offset: 0.631738, stopColor: colors.color1 },
        { offset: 0.692708, stopColor: colors.color8 },
        { offset: 0.75, stopColor: colors.color14 },
        { offset: 0.817708, stopColor: colors.color9 },
        { offset: 0.869792, stopColor: colors.color10 },
        { offset: 1, stopColor: colors.color1 },
      ],
    },
    svg3: {
      gradientTransform:
        "translate(264.5 339.5) rotate(-42.3022) scale(946.451 1372.05)",
      stops: [
        { offset: 0, stopColor: colors.color1 },
        { offset: 0.188423, stopColor: colors.color2 },
        { offset: 0.307292, stopColor: colors.color1 },
        { offset: 0.328792, stopColor: colors.color4 },
        { offset: 0.328892, stopColor: colors.color5 },
        { offset: 0.442708, stopColor: colors.color15 },
        { offset: 0.537556, stopColor: colors.color16 },
        { offset: 0.631738, stopColor: colors.color1 },
        { offset: 0.725645, stopColor: colors.color17 },
        { offset: 0.817779, stopColor: colors.color9 },
        { offset: 0.84375, stopColor: colors.color10 },
        { offset: 0.90569, stopColor: colors.color1 },
        { offset: 1, stopColor: colors.color11 },
      ],
    },
    svg4: {
      gradientTransform:
        "translate(860.5 420) rotate(-153.984) scale(957.528 1388.11)",
      stops: [
        { offset: 0.109375, stopColor: colors.color11 },
        { offset: 0.171875, stopColor: colors.color2 },
        { offset: 0.260417, stopColor: colors.color13 },
        { offset: 0.328792, stopColor: colors.color4 },
        { offset: 0.328892, stopColor: colors.color5 },
        { offset: 0.328992, stopColor: colors.color1 },
        { offset: 0.442708, stopColor: colors.color6 },
        { offset: 0.515625, stopColor: colors.color7 },
        { offset: 0.631738, stopColor: colors.color1 },
        { offset: 0.692708, stopColor: colors.color8 },
        { offset: 0.817708, stopColor: colors.color9 },
        { offset: 0.869792, stopColor: colors.color10 },
        { offset: 1, stopColor: colors.color11 },
      ],
    },
  };

  const maxStops = Math.max(
    ...Object.values(svgStates).map((svg) => svg.stops.length)
  );
  const stopsAnimationArray = createStopsArray(svgStates, svgOrder, maxStops);
  const gradientTransform = svgOrder.map(
    (svgKey) => svgStates[svgKey].gradientTransform
  );
  // Unique per instance — several of these render at once, and duplicate SVG
  // ids would make every rect resolve to the first gradient in the document.
  const gradientId = useId();

  return (
    <svg
      className={className}
      width="1030"
      height="280"
      viewBox="0 0 1030 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="1030" height="280" rx="140" fill={`url(#${gradientId})`} />
      <defs>
        <motion.radialGradient
          id={gradientId}
          cx="0"
          cy="0"
          r="1"
          gradientUnits="userSpaceOnUse"
          initial={{ gradientTransform: gradientTransform[0] }}
          animate={{ gradientTransform }}
          transition={{
            duration: isHovered ? 50 : 10,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
        >
          {stopsAnimationArray.map((stopConfigs, index) => (
            <AnimatePresence key={index}>
              <motion.stop
                initial={{
                  offset: stopConfigs[0].offset,
                  stopColor: stopConfigs[0].stopColor,
                }}
                animate={{
                  offset: stopConfigs.map((config) => config.offset),
                  stopColor: stopConfigs.map((config) => config.stopColor),
                }}
                transition={{
                  duration: 0,
                  ease: "linear",
                  repeat: Number.POSITIVE_INFINITY,
                }}
              />
            </AnimatePresence>
          ))}
        </motion.radialGradient>
      </defs>
    </svg>
  );
};

type LiquidProps = {
  isHovered: boolean;
  colors: Colors;
};

export const Liquid: React.FC<LiquidProps> = ({ isHovered, colors }) => {
  return (
    <>
      {Array.from({ length: 7 }).map((_, index) => (
        <div
          key={index}
          className={`absolute ${
            index < 3 ? "w-[443px] h-[121px]" : "w-[756px] h-[207px]"
          } ${
            index === 0
              ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mix-blend-difference"
              : index === 1
                ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rotate-[164.971deg] mix-blend-difference"
                : index === 2
                  ? "top-1/2 left-1/2 -translate-x-[53%] -translate-y-[53%] rotate-[-11.61deg] mix-blend-difference"
                  : index === 3
                    ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-[57%] rotate-[-179.012deg] mix-blend-difference"
                    : index === 4
                      ? "top-1/2 left-1/2 -translate-x-[57%] -translate-y-1/2 rotate-[-29.722deg] mix-blend-difference"
                      : index === 5
                        ? "top-1/2 left-1/2 -translate-x-[62%] -translate-y-[24%] rotate-[160.227deg] mix-blend-difference"
                        : "top-1/2 left-1/2 -translate-x-[67%] -translate-y-[29%] rotate-180 mix-blend-hard-light"
          }`}
        >
          <GradientSvg
            className="w-full h-full"
            isHovered={isHovered}
            colors={colors}
          />
        </div>
      ))}
    </>
  );
};

// Veyr-tinted liquid palette: whites plus the indigo/blue family the site
// already uses for accents.
export const LIQUID_COLORS: Colors = {
  color1: "#FFFFFF",
  color2: "#1E10C5",
  color3: "#9089E2",
  color4: "#FCFCFE",
  color5: "#F9F9FD",
  color6: "#B2B8E7",
  color7: "#0E2DCB",
  color8: "#0017E9",
  color9: "#4743EF",
  color10: "#7D7BF4",
  color11: "#0B06FC",
  color12: "#C5C1EA",
  color13: "#1403DE",
  color14: "#B6BAF6",
  color15: "#C1BEEB",
  color16: "#290ECB",
  color17: "#3F4CC0",
};

export function LiquidCTA({
  href,
  children,
  download,
  external,
  className,
}: {
  href: string;
  children: ReactNode;
  download?: boolean;
  external?: boolean;
  className?: string;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <a
      href={href}
      download={download}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative inline-block h-11 rounded-lg border border-white/40 bg-black",
        className
      )}
    >
      {/* Outer bloom that leaks the liquid colors past the button edge. */}
      <div className="absolute left-1/2 top-[8.57%] h-[128.57%] w-[112.81%] -translate-x-1/2 opacity-30 blur-[19px]">
        <span className="absolute inset-0 rounded-lg bg-[#d9d9d9] blur-[6.5px]" />
        <div className="relative h-full w-full overflow-hidden rounded-lg">
          <Liquid isHovered={isHovered} colors={LIQUID_COLORS} />
        </div>
      </div>
      <div className="absolute left-1/2 top-1/2 h-[112.85%] w-[92.23%] -translate-x-1/2 -translate-y-[40%] rounded-lg bg-[#010128] blur-[7.3px]" />
      {/* The liquid surface itself. */}
      <div className="absolute inset-0 overflow-hidden rounded-lg">
        <span className="absolute inset-0 rounded-lg bg-[#d9d9d9]" />
        <span className="absolute inset-0 rounded-lg bg-black" />
        <Liquid isHovered={isHovered} colors={LIQUID_COLORS} />
        {/* Scrim that mutes the liquid so it reads as a tint, not a light show. */}
        <span className="absolute inset-0 rounded-lg bg-black/60" />
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`absolute inset-0 rounded-lg border-[3px] border-white mix-blend-overlay ${
              i <= 2 ? "blur-[3px]" : i === 3 ? "blur-[5px]" : "blur-[4px]"
            }`}
          />
        ))}
        <span className="absolute left-1/2 top-1/2 h-[42.85%] w-[70.8%] -translate-x-1/2 -translate-y-[40%] rounded-lg bg-[#000066] blur-[15px]" />
      </div>
      <span className="relative z-10 flex h-full items-center justify-center gap-2 whitespace-nowrap px-5 text-sm font-semibold tracking-wide text-white transition-colors group-hover:text-[#B1C5FF]">
        {children}
      </span>
    </a>
  );
}
