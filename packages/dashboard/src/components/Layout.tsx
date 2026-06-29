import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { SpiralAnimation } from "@/components/ui/spiral-animation";
import VeyrMark, { VeyrWordmark } from "./VeyrMark";
import { authEnabled, signOut } from "../lib/auth";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/prompt", label: "Prompt Helper" },
  { to: "/documents", label: "Documents" },
  { to: "/keys", label: "API Keys" },
  { to: "/settings", label: "Settings" },
];

// Once per browser session: play the intro splash a single time.
const INTRO_KEY = "veyr:intro-played";

function introAlreadyPlayed() {
  try {
    return sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return false;
  }
}

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  // `intro` = spiral is full-screen and content is hidden.
  // `splashMounted` keeps the canvas in the DOM until its fade-out finishes.
  const [intro, setIntro] = useState(() => !introAlreadyPlayed());
  const [splashMounted, setSplashMounted] = useState(() => !introAlreadyPlayed());

  function finishIntro() {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      // ignore
    }
    setIntro(false);
    // Unmount the canvas once the fade-out transition has completed.
    window.setTimeout(() => setSplashMounted(false), 1200);
  }

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="relative min-h-screen bg-[#0a0b10] text-neutral-100">
      {/* Full-strength intro spiral. Sits on top and hides everything, then
          fades out to reveal the dashboard once the play-through completes. */}
      {splashMounted && (
        <div
          className={`pointer-events-none fixed inset-0 z-50 bg-black transition-opacity duration-1000 ${
            intro ? "opacity-100" : "opacity-0"
          }`}
        >
          <SpiralAnimation
            starCount={5000}
            duration={7}
            onComplete={finishIntro}
            className="absolute inset-0 h-full w-full"
          />
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-px bg-gradient-to-r from-transparent via-[#5b8def]/25 to-transparent" />

      <div
        className={`relative z-10 flex min-h-screen transition-opacity duration-1000 ${
          intro ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0e15]/70 backdrop-blur-md">
          <div className="px-6 py-5">
            <Link to="/" className="flex items-center gap-3">
              <VeyrMark className="h-8 w-8" />
              <div>
                <VeyrWordmark className="text-sm" />
                <div className="text-xs text-neutral-500">v0.1</div>
              </div>
            </Link>
          </div>

          <nav className="flex-1 px-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `mt-1 block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border border-[#5b8def]/25 bg-[#5b8def]/10 text-[#9cc0ff]"
                      : "border border-transparent text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {authEnabled && (
            <div className="px-3 pb-5">
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </aside>

        <main className="relative flex-1 overflow-auto">
          <div className="p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
