import * as React from "react";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  type Variants,
} from "framer-motion";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import VeyrMark from "../VeyrMark";

export interface AnimatedNavItem {
  name: string;
  href: string;
  /** Drop the link below the sm breakpoint so the pill fits narrow screens. */
  mobileHidden?: boolean;
}

const EXPAND_SCROLL_THRESHOLD = 80;

const containerVariants: Variants = {
  expanded: {
    y: 0,
    opacity: 1,
    width: "auto",
    transition: {
      y: { type: "spring", damping: 18, stiffness: 250 },
      opacity: { duration: 0.3 },
      type: "spring",
      damping: 20,
      stiffness: 300,
      staggerChildren: 0.07,
      delayChildren: 0.2,
    },
  },
  collapsed: {
    y: 0,
    opacity: 1,
    width: "3rem",
    transition: {
      type: "spring",
      damping: 20,
      stiffness: 300,
      when: "afterChildren",
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

const logoVariants: Variants = {
  expanded: {
    opacity: 1,
    x: 0,
    rotate: 0,
    transition: { type: "spring", damping: 15 },
  },
  collapsed: { opacity: 0, x: -25, rotate: -180, transition: { duration: 0.3 } },
};

const itemVariants: Variants = {
  expanded: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: "spring", damping: 15 },
  },
  collapsed: { opacity: 0, x: -20, scale: 0.95, transition: { duration: 0.2 } },
};

const collapsedIconVariants: Variants = {
  expanded: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
  collapsed: {
    opacity: 1,
    scale: 1,
    transition: { type: "spring", damping: 15, stiffness: 300, delay: 0.15 },
  },
};

interface AnimatedNavProps {
  items: AnimatedNavItem[];
  /**
   * Scroll depth (px) below which the nav never collapses. Evaluated per
   * scroll event so it can measure the live layout — e.g. the end of a
   * sticky hero's pinned phase. Defaults to 150.
   */
  collapseAfter?: () => number;
}

export function AnimatedNav({ items, collapseAfter }: AnimatedNavProps) {
  const [isExpanded, setExpanded] = React.useState(true);

  const { scrollY } = useScroll();
  const lastScrollY = React.useRef(0);
  const scrollPositionOnCollapse = React.useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = lastScrollY.current;
    const collapseThreshold = collapseAfter ? collapseAfter() : 150;

    if (isExpanded && latest > previous && latest > collapseThreshold) {
      setExpanded(false);
      scrollPositionOnCollapse.current = latest;
    } else if (!isExpanded) {
      if (latest > previous) {
        // Track the furthest scroll-down point so a deliberate upward scroll
        // re-expands from anywhere, not only near the original collapse point.
        scrollPositionOnCollapse.current = Math.max(
          scrollPositionOnCollapse.current,
          latest
        );
      } else if (
        scrollPositionOnCollapse.current - latest >
        EXPAND_SCROLL_THRESHOLD
      ) {
        setExpanded(true);
      }
    }

    lastScrollY.current = latest;
  });

  const handleNavClick = (e: React.MouseEvent) => {
    if (!isExpanded) {
      e.preventDefault();
      setExpanded(true);
    }
  };

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)]">
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={isExpanded ? "expanded" : "collapsed"}
        variants={containerVariants}
        whileHover={!isExpanded ? { scale: 1.1 } : {}}
        whileTap={!isExpanded ? { scale: 0.95 } : {}}
        onClick={handleNavClick}
        className={cn(
          "relative flex items-center overflow-hidden rounded-full border border-border bg-background/80 shadow-lg backdrop-blur-sm h-12",
          !isExpanded && "cursor-pointer justify-center"
        )}
      >
        <motion.a
          href="#top"
          variants={logoVariants}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 flex items-center pl-3.5 pr-2"
          aria-label="Veyr — back to top"
        >
          <VeyrMark className="h-6 w-6" />
        </motion.a>

        {/* Links are non-interactive while collapsed so the whole pill acts
            as a single expand button. */}
        <motion.div
          className={cn(
            "flex items-center gap-0 sm:gap-2 pr-4",
            !isExpanded && "pointer-events-none"
          )}
        >
          {items.map((item) => (
            <motion.a
              key={item.name}
              href={item.href}
              variants={itemVariants}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "whitespace-nowrap text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1",
                item.mobileHidden && "max-sm:hidden"
              )}
            >
              {item.name}
            </motion.a>
          ))}
        </motion.div>

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            variants={collapsedIconVariants}
            animate={isExpanded ? "expanded" : "collapsed"}
          >
            <Menu className="h-6 w-6" />
          </motion.div>
        </div>
      </motion.nav>
    </div>
  );
}
