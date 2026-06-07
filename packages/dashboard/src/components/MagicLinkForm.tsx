import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { sendMagicLink } from "../lib/auth";

type State = "idle" | "sending" | "sent" | "error";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("sending");
    setError(null);
    try {
      await sendMagicLink(email.trim());
      setState("sent");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (state === "sent") {
    return (
      <div className="mx-auto max-w-md border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-center text-sm text-emerald-200">
        Check your inbox — we sent a magic link to{" "}
        <span className="font-medium">{email}</span>. Click it to finish signing
        in.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto flex w-full max-w-md flex-col items-center gap-3 sm:flex-row"
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="w-full flex-1 border border-white/15 bg-black px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:border-[#4FABFF]/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="inline-flex w-full items-center justify-center gap-2 border border-white bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:opacity-60 sm:w-auto"
      >
        {state === "sending" ? "Sending…" : "Get started"}
        <ArrowRight className="h-4 w-4" />
      </button>
      {error && (
        <p className="w-full text-center text-xs text-red-400 sm:text-left">
          {error}
        </p>
      )}
    </form>
  );
}
