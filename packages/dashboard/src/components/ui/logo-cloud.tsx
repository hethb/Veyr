import { InfiniteSlider } from "@/components/ui/infinite-slider";
import { ProgressiveBlur } from "@/components/ui/progressive-blur";

export type Logo = {
  name: string;
  /** Path to a square (1:1) logomark SVG. Omit when using `emoji` instead. */
  src?: string;
  /** A single emoji character, for brands whose only mark is an emoji glyph. */
  emoji?: string;
};

type LogoCloudProps = React.ComponentProps<"div"> & {
  logos: Logo[];
};

export function LogoCloud({ logos, ...props }: LogoCloudProps) {
  return (
    <div
      className="relative mx-auto max-w-3xl bg-gradient-to-r from-white/[0.03] via-transparent to-white/[0.03] py-6 md:border-x md:border-white/10"
      {...props}
    >
      <div className="-translate-x-1/2 -top-px pointer-events-none absolute left-1/2 w-screen border-t border-white/10" />
      <InfiniteSlider gap={48} reverse speed={70} speedOnHover={24}>
        {logos.map((logo) => (
          <div
            className="flex shrink-0 select-none items-center gap-2 pointer-events-none"
            key={`logo-${logo.name}`}
          >
            {logo.src ? (
              <img
                alt={logo.name}
                className="h-5 w-5 md:h-6 md:w-6"
                height={24}
                loading="lazy"
                src={logo.src}
                width={24}
              />
            ) : (
              <span
                aria-hidden
                className="flex h-5 w-5 items-center justify-center text-base leading-none md:h-6 md:w-6 md:text-lg"
              >
                {logo.emoji}
              </span>
            )}
            <span className="whitespace-nowrap text-sm font-medium text-neutral-300 md:text-base">
              {logo.name}
            </span>
          </div>
        ))}
      </InfiniteSlider>
      <ProgressiveBlur
        blurIntensity={1}
        className="pointer-events-none absolute top-0 left-0 h-full w-[160px]"
        direction="left"
      />
      <ProgressiveBlur
        blurIntensity={1}
        className="pointer-events-none absolute top-0 right-0 h-full w-[160px]"
        direction="right"
      />
      <div className="-translate-x-1/2 -bottom-px pointer-events-none absolute left-1/2 w-screen border-b border-white/10" />
    </div>
  );
}
