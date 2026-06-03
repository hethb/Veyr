import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) navigate("/dashboard", { replace: true });
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-black text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#076EFF]/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#FFB7C5]/30 to-transparent" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <Link to="/" className="mb-10 flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center border border-[#076EFF] bg-black text-sm font-bold text-[#4FABFF]">
            PL
          </span>
          <span className="text-base font-semibold tracking-tight text-white">
            PromptLens
          </span>
        </Link>

        <div className="border border-white/10 bg-black p-8">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#4FABFF]">
            Sign in
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Use the email and password for your account.
          </p>

          {!isSupabaseConfigured && (
            <div className="mt-4 border border-[#4FABFF]/30 bg-[#076EFF]/5 px-3 py-2 text-xs text-neutral-300">
              Supabase is not configured. Copy{" "}
              <code className="font-mono text-[#4FABFF]">.env.example</code> to{" "}
              <code className="font-mono text-[#4FABFF]">.env</code> and set your
              Supabase credentials.
            </div>
          )}

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-neutral-400"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-[#4FABFF]/50 focus:outline-none focus:ring-1 focus:ring-[#4FABFF]/30"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium text-neutral-400"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full border border-white/10 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-[#4FABFF]/50 focus:outline-none focus:ring-1 focus:ring-[#4FABFF]/30"
              />
            </div>

            {error && (
              <div className="border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !isSupabaseConfigured}
              className="flex w-full items-center justify-center gap-2 border border-[#076EFF] bg-[#076EFF] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4FABFF] hover:border-[#4FABFF] disabled:opacity-50"
            >
              {submitting ? "Signing in…" : "Sign in"}
              {!submitting && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-neutral-500">
            <Link to="/" className="transition-colors hover:text-[#4FABFF]">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
