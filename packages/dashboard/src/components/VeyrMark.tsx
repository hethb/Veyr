// The Veyr brand mark: a flower of nine molecular bonds (two balls joined by a
// concave waist) in a pinwheel. Monochrome, currentColor — place it on any
// surface. The favicon variant in public/favicon.svg adds the dark tile.

interface VeyrMarkProps {
  className?: string;
}

export default function VeyrMark({ className = "h-8 w-8" }: VeyrMarkProps) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
        <g transform="translate(50.000,31.000) rotate(-60.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
        <g transform="translate(62.213,35.445) rotate(-20.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
        <g transform="translate(68.711,46.701) rotate(20.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
        <g transform="translate(66.454,59.500) rotate(60.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
        <g transform="translate(56.498,67.854) rotate(100.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
        <g transform="translate(43.502,67.854) rotate(140.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
        <g transform="translate(33.546,59.500) rotate(180.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
        <g transform="translate(31.289,46.701) rotate(220.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
        <g transform="translate(37.787,35.445) rotate(260.000) scale(0.6)"><path d="M 7.458,4.877 A 16.133,16.133 0 0 0 -7.458,4.877 A 5.500,5.500 0 1 1 -7.458,-4.877 A 16.133,16.133 0 0 0 7.458,-4.877 A 5.500,5.500 0 1 1 7.458,4.877 Z"/></g>
      </g>
    </svg>
  );
}

/**
 * The full-name logo: the geometric "VEYR" wordmark, monochrome (currentColor).
 * Pairs with the bond-flower mark (above) in headers; use plain "Veyr" in
 * running text.
 */
export function VeyrWordmark({ className = "h-4" }: VeyrMarkProps) {
  return (
    <svg
      viewBox="0 0 282 84"
      className={className}
      role="img"
      aria-label="Veyr"
      fill="currentColor"
    >
      <path d="M 6.00,0.00 L 19.50,0.00 L 37.00,52.00 L 54.50,0.00 L 68.00,0.00 L 37.00,72.00 Z"/>
      <rect x="88.00" y="0.00" width="13.50" height="72.00"/><rect x="88.00" y="0.00" width="50.00" height="13.50"/><rect x="88.00" y="29.25" width="50.00" height="13.50"/><rect x="88.00" y="58.50" width="50.00" height="13.50"/>
      <path d="M 164.75,0 C 164.75,31.68 188.00,26.40 188.00,44.00 L 188.00,72.00" fill="none" stroke="currentColor" strokeWidth="13.5" strokeLinecap="butt" strokeLinejoin="round"/><path d="M 211.25,0 C 211.25,31.68 188.00,26.40 188.00,44.00" fill="none" stroke="currentColor" strokeWidth="13.5" strokeLinecap="butt" strokeLinejoin="round"/>
      <rect x="238.00" y="0.00" width="13.50" height="72.00"/><path d="M 251.50,0 L 255.50,0 A 20.00,20.00 0 0 1 255.50,40.00 L 251.50,40.00 L 251.50,26.50 L 255.50,26.50 A 6.50,6.50 0 0 0 255.50,13.50 L 251.50,13.50 Z"/><path d="M 251.50,26.50 L 265.00,26.50 L 275.50,72.00 L 262.00,72.00 Z"/>
    </svg>
  );
}
