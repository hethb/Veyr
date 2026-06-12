// The Canopy brand mark: two canopy arcs over three falling dots.
// Transparent background — place it on any surface (the favicon variant in
// public/favicon.svg adds the dark rounded tile).

interface CanopyMarkProps {
  className?: string;
}

export default function CanopyMark({ className = "h-8 w-8" }: CanopyMarkProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="canopy-arc1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5EA2FF" />
          <stop offset="1" stopColor="#2E6BFF" />
        </linearGradient>
        <linearGradient id="canopy-arc2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3E7BFF" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <path
        d="M 6 22 A 19 19 0 0 1 42 22"
        fill="none"
        stroke="url(#canopy-arc1)"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path
        d="M 12.5 28 A 12.5 12.5 0 0 1 35.5 28"
        fill="none"
        stroke="url(#canopy-arc2)"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <circle cx="24" cy="34.5" r="2.4" fill="#3E7BFF" />
      <circle cx="24" cy="40.5" r="2.1" fill="#3E7BFF" />
      <circle cx="24" cy="45.8" r="1.8" fill="#3E7BFF" />
    </svg>
  );
}

/**
 * The spaced-caps wordmark from the brand sheet: C Λ N O P Y with the "A"
 * in canopy blue. Use next to the mark in headers; use plain "Canopy" in
 * running text.
 */
export function CanopyWordmark({ className = "text-base" }: CanopyMarkProps) {
  return (
    <span className={`font-semibold uppercase tracking-[0.35em] text-white ${className}`}>
      C<span className="text-[#3E7BFF]">a</span>nopy
    </span>
  );
}
