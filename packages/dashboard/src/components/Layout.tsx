import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { GradientDots } from "@/components/ui/gradient-dots";
import { supabase } from "../lib/supabase";

interface LayoutProps {
  children: ReactNode;
}

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/keys", label: "API Keys" },
  { to: "/settings", label: "Settings" },
];

export function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="relative min-h-screen bg-black text-white">
      <GradientDots
        dotSize={2}
        spacing={14}
        spotlightRadius={200}
        backgroundColor="#000000"
        className="pointer-events-none fixed inset-0 z-0"
      />

      <div className="pointer-events-none fixed inset-x-0 top-0 z-30 h-px bg-gradient-to-r from-transparent via-[#076EFF]/60 to-transparent" />

      <div className="relative z-10 flex min-h-screen">
        <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-black/70 backdrop-blur-md">
          <div className="px-6 py-5">
            <Link to="/" className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center border border-[#076EFF] bg-black text-sm font-bold text-[#4FABFF]">
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
                  `mt-1 block px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "border border-[#076EFF]/40 bg-[#076EFF]/10 text-[#4FABFF]"
                      : "border border-transparent text-neutral-400 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-white/10 p-3">
            <button
              type="button"
              onClick={signOut}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </aside>

        <main className="relative flex-1 overflow-auto">
          <div className="p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
