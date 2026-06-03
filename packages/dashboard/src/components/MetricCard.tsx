import { cn } from "@/lib/utils";
import { formatNumber, formatUsd } from "../lib/format";
import { Skeleton } from "./Skeleton";

interface MetricCardProps {
  label: string;
  cost: number | null;
  requests: number | null;
  loading: boolean;
  variant?: "light" | "dark";
}

export function MetricCard({
  label,
  cost,
  requests,
  loading,
  variant = "light",
}: MetricCardProps) {
  const dark = variant === "dark";

  return (
    <div
      className={cn(
        "border p-5",
        dark
          ? "border-white/10 bg-black"
          : "rounded-xl border-slate-200 bg-white shadow-sm"
      )}
    >
      <div
        className={cn(
          "text-xs font-medium uppercase tracking-wider",
          dark ? "text-neutral-500" : "text-slate-500"
        )}
      >
        {label}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      ) : (
        <>
          <div
            className={cn(
              "mt-2 text-3xl font-semibold tabular-nums",
              dark ? "text-white" : "text-slate-900"
            )}
          >
            {formatUsd(cost ?? 0, 4)}
          </div>
          <div
            className={cn("mt-1 text-sm", dark ? "text-neutral-500" : "text-slate-500")}
          >
            {formatNumber(requests ?? 0)} requests
          </div>
        </>
      )}
    </div>
  );
}
