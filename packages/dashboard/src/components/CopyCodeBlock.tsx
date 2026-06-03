import { cn } from "@/lib/utils";
import { Check, Copy, X } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../lib/clipboard";

interface CopyCodeBlockProps {
  code: string;
  className?: string;
}

type CopyState = "idle" | "copied" | "error";

export function CopyCodeBlock({ code, className }: CopyCodeBlockProps) {
  const [state, setState] = useState<CopyState>("idle");

  async function handleCopy() {
    const ok = await copyToClipboard(code);
    setState(ok ? "copied" : "error");
    window.setTimeout(() => setState("idle"), 2000);
  }

  const label =
    state === "copied" ? "Copied" : state === "error" ? "Copy failed" : "Copy command";

  return (
    <div className={cn("relative mt-5 border border-white/10 bg-neutral-950", className)}>
      <pre className="overflow-x-auto px-3 py-2.5 pr-11 font-mono text-xs leading-relaxed text-neutral-400">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={label}
        title={label}
        className="absolute right-2 top-2 border border-white/10 bg-black p-1.5 text-neutral-400 transition-colors hover:border-[#4FABFF]/40 hover:text-[#4FABFF]"
      >
        {state === "copied" ? (
          <Check className="h-3.5 w-3.5 text-[#4FABFF]" />
        ) : state === "error" ? (
          <X className="h-3.5 w-3.5 text-red-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
