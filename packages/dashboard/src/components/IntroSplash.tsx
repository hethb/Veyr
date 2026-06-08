import { useEffect, useState } from "react";
import { SpiralAnimation } from "@/components/ui/spiral-animation";

/**
 * Full-screen spiral intro shown as the first thing after entering the
 * dashboard. Clicking "Enter" (or pressing Enter) fades it out and reveals the
 * app underneath.
 */
export function IntroSplash({ onEnter }: { onEnter: () => void }) {
  const [textVisible, setTextVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTextVisible(true), 1800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" || e.key === "Escape") handleEnter();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEnter() {
    setLeaving((prev) => {
      if (prev) return prev;
      window.setTimeout(onEnter, 700);
      return true;
    });
  }

  return (
    <div
      className={`fixed inset-0 z-[100] overflow-hidden bg-black transition-opacity duration-700 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="absolute inset-0">
        <SpiralAnimation />
      </div>

      {/* subtle vignette so the centered text reads over the bright core */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      <div
        className={`absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-7 text-center transition-all duration-1000 ease-out ${
          textVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.5em] text-white/45">
            PromptLens
          </div>
          <div className="mt-3 text-lg font-extralight tracking-[0.15em] text-white/85">
            See where your tokens go
          </div>
        </div>

        <button
          type="button"
          onClick={handleEnter}
          className="animate-pulse text-2xl font-extralight uppercase tracking-[0.2em] text-white transition-all duration-700 hover:tracking-[0.3em]"
        >
          Enter
        </button>
      </div>
    </div>
  );
}
