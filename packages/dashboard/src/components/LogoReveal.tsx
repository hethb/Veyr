import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

// The Veyr mark as a single stroke, drawn tip-to-tail via a dash-offset sweep
// when the section scrolls into view. Leaving the viewport resets it, so the
// reveal replays on every pass.
const MARK_PATH =
  "M 4.00 51.95 C 3.32 46.78 5.95 43.43 9.13 39.83 C 12.32 36.24 18.96 33.02 23.10 30.39 C 27.24 27.75 30.39 26.11 33.98 24.02 C 37.58 21.93 40.72 20.12 44.66 17.86 C 48.60 15.60 52.53 12.35 57.60 10.47 C 62.66 8.59 69.95 5.40 75.05 6.57 C 80.15 7.73 85.39 12.83 88.20 17.45 C 91.00 22.07 90.90 29.12 91.89 34.29 C 92.89 39.46 93.47 43.63 94.15 48.46 C 94.84 53.29 96.82 58.52 96.00 63.25 C 95.18 67.97 92.51 73.34 89.22 76.80 C 85.94 80.26 80.50 81.80 76.29 83.99 C 72.08 86.18 68.31 88.26 63.96 89.94 C 59.62 91.62 55.00 93.78 50.21 94.05 C 45.41 94.32 39.70 93.47 35.21 91.58 C 30.73 89.70 26.97 86.21 23.30 82.75 C 19.64 79.30 16.46 75.98 13.24 70.84 C 10.02 65.71 4.68 57.12 4.00 51.95 Z";

const DURATION = 1900; // ms, total travel time of the line

export function LogoReveal() {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const glowTimer = useRef<number>();

  useEffect(() => {
    const section = sectionRef.current;
    const path = pathRef.current;
    const glow = glowRef.current;
    if (!section || !path || !glow) return;

    if (reduceMotion) {
      glow.style.opacity = "1";
      return;
    }

    const len = path.getTotalLength();

    const reset = () => {
      window.clearTimeout(glowTimer.current);
      glow.style.opacity = "0";
      path.style.transition = "none";
      path.style.strokeDasharray = `${len}`;
      path.style.strokeDashoffset = `${len}`;
    };

    const play = () => {
      reset();
      // force reflow so the reset lands before the animated transition starts
      path.getBoundingClientRect();
      requestAnimationFrame(() => {
        path.style.transition = `stroke-dashoffset ${DURATION}ms cubic-bezier(.45,0,.4,1)`;
        path.style.strokeDashoffset = "0";
      });
      glowTimer.current = window.setTimeout(() => {
        glow.style.opacity = "1";
      }, DURATION - 250);
    };

    reset();
    const observer = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? play() : reset()),
      { threshold: 0.5 }
    );
    observer.observe(section);

    return () => {
      observer.disconnect();
      window.clearTimeout(glowTimer.current);
    };
  }, [reduceMotion]);

  return (
    <section ref={sectionRef} className="border-t border-white/10 bg-black">
      <div className="mx-auto flex max-w-6xl items-center justify-center px-6 py-24">
        <div className="relative h-44 w-44">
          <div
            ref={glowRef}
            aria-hidden
            className="absolute -inset-[30%] rounded-full opacity-0 transition-opacity duration-1000 ease-out"
            style={{
              background:
                "radial-gradient(circle, rgba(245,245,244,0.16) 0%, transparent 68%)",
            }}
          />
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox="0 0 100 100"
            role="img"
            aria-label="Veyr"
          >
            <path
              ref={pathRef}
              d={MARK_PATH}
              fill="none"
              stroke="#f5f5f4"
              strokeWidth={4.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </section>
  );
}
