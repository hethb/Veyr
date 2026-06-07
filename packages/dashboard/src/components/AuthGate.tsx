import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { authEnabled, supabase } from "../lib/auth";

/**
 * Protects routes when auth is enabled. In local mode (auth disabled) it's a
 * transparent pass-through, preserving the zero-config experience.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<"checking" | "in" | "out">(
    authEnabled ? "checking" : "in"
  );

  useEffect(() => {
    if (!authEnabled || !supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setStatus(data.session ? "in" : "out");
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setStatus(session ? "in" : "out");
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="grid min-h-screen place-items-center bg-black text-sm text-neutral-500">
        Loading…
      </div>
    );
  }
  if (status === "out") return <Navigate to="/" replace />;
  return <>{children}</>;
}
