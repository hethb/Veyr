// The Veyr brand mark (rounded blob symbol) and wordmark (the "VEYR" lettering
// with a teal→blue gradient R). The supplied artwork is light/colored on a dark
// background; the assets here are that exact artwork lifted onto transparency
// (color preserved), so it drops onto the app's dark surfaces with no tinting.
// The combined lockup (veyr-full.png) backs the social/OG card.
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
