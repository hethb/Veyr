import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { GradientDots } from "@/components/ui/gradient-dots";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <GradientDots
          duration={20}
          backgroundColor="#000000"
          className="pointer-events-none fixed inset-0 z-0"
        />
        <div className="relative z-10 max-w-md border border-white/10 bg-black/70 p-8 text-center backdrop-blur-md">
          <h1 className="text-lg font-semibold text-white">Supabase not configured</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Copy <code className="font-mono text-xs text-[#4FABFF]">.env.example</code> to{" "}
            <code className="font-mono text-xs text-[#4FABFF]">.env</code> and set your Supabase
            credentials, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-black text-sm text-neutral-500">
        <GradientDots
          duration={20}
          backgroundColor="#000000"
          className="pointer-events-none fixed inset-0 z-0"
        />
        <span className="relative z-10">Loading…</span>
      </div>
    );
  }

  if (session === null) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
