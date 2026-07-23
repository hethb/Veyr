// The Veyr brand mark (bond-flower symbol) and wordmark. The supplied artwork is
// dark ink on white; every placement in this app sits on a dark surface, so the
// assets here are the exact artwork lifted onto transparency and recolored white
// (see scripts) — no runtime tinting needed. The combined lockup (veyr-full.png)
// backs the social/OG card.
import markSrc from "../assets/veyr-mark.png";
import wordmarkSrc from "../assets/veyr-wordmark.png";

interface VeyrMarkProps {
  className?: string;
}

export default function VeyrMark({ className = "h-8 w-8" }: VeyrMarkProps) {
  return (
    <img
      src={markSrc}
      alt=""
      aria-hidden="true"
      className={`${className} object-contain`}
    />
  );
}

/**
 * The full-name "VEYR" wordmark. Pairs with the bond-flower mark (above) in
 * headers; use plain "Veyr" in running text.
 */
export function VeyrWordmark({ className = "h-4 w-auto" }: VeyrMarkProps) {
  return (
    <img
      src={wordmarkSrc}
      alt="Veyr"
      className={`${className} object-contain`}
    />
  );
}
