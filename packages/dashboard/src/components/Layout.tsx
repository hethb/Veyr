import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { GradientDots } from "@/components/ui/gradient-dots";
import { IntroSplash } from "@/components/IntroSplash";
import { authEnabled, signOut } from "../lib/auth";

interface LayoutProps {
  children: ReactNode;
}

const INTRO_KEY = "promptlens:intro-seen";

function introAlreadySeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_KEY) === "1";
  } catch {
    return true;
  }
}

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/prompt", label: "Prompt Helper" },
  { to: "/keys", label: "API Keys" },
  { to: "/settings", label: "Settings" },
];

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const [showIntro, setShowIntro] = useState(() => !introAlreadySeen());

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  function dismissIntro() {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowIntro(false);
  }

  return (
    <div className="relative min-h-screen bg-[#0a0b10] text-neutral-100">
      {showIntro && <IntroSplash onEnter={dismissIntro} />}
      <GradientDots
        dotSize={1.6}
        spacing={20}
        spotlightRadius={240}
        backgroundColor="#0a0b10"
        className="pointer-events-none fixed inset-0 z-0"
      />

      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-px bg-gradient-to-r from-transparent via-[#5b8def]/25 to-transparent" />

      <div className="relative z-10 flex min-h-screen">
        <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0e15]/70 backdrop-blur-md">
          <div className="px-6 py-5">
            <Link to="/" className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-md border border-[#5b8def]/50 bg-white/[0.03] text-sm font-bold text-[#8fb6ff]">
                PL
              </span>
              <div>
                <div className="text-sm font-semibold tracking-tight text-white">
                  PromptLens
                </div>
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
