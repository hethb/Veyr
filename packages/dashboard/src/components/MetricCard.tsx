import { formatNumber, formatUsd } from "../lib/format";
import { Skeleton } from "./Skeleton";

interface MetricCardProps {
  label: string;
  cost: number | null;
  requests: number | null;
  loading: boolean;
}

export function MetricCard({ label, cost, requests, loading }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      ) : (
        <>
          <div className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
            {formatUsd(cost ?? 0, 4)}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {formatNumber(requests ?? 0)} requests
          </div>
        </>
      )}
    </div>
  );
}
