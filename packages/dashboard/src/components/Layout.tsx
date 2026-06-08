import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { SpiralAnimation } from "@/components/ui/spiral-animation";
import { authEnabled, signOut } from "../lib/auth";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/prompt", label: "Prompt Helper" },
  { to: "/keys", label: "API Keys" },
  { to: "/settings", label: "Settings" },
];

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate("/", { replace: true });
  }

  return (
    <div className="relative min-h-screen bg-[#0a0b10] text-neutral-100">
      {/* Live spiral background. Dimmed + scrimmed so content stays readable. */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <SpiralAnimation
          starCount={2200}
          className="absolute inset-0 h-full w-full opacity-[0.28]"
        />
        <div className="absolute inset-0 bg-[#0a0b10]/72" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(10,11,16,0) 0%, rgba(10,11,16,0.55) 70%, rgba(10,11,16,0.9) 100%)",
          }}
        />
      </div>

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
