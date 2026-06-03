import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { TopTemplateRow } from "../lib/api";
import { formatNumber, formatUsd } from "../lib/format";

interface TopTemplatesTableProps {
  rows: TopTemplateRow[];
  filterTag: string | null;
  variant?: "light" | "dark";
}

type SortDir = "asc" | "desc";

export function TopTemplatesTable({
  rows,
  filterTag,
  variant = "light",
}: TopTemplatesTableProps) {
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const dark = variant === "dark";

  const filtered = useMemo(() => {
    const list = filterTag
      ? rows.filter((r) => r.feature_tag === filterTag)
      : rows;
    return [...list].sort((a, b) =>
      sortDir === "desc" ? b.total_cost - a.total_cost : a.total_cost - b.total_cost
    );
  }, [rows, filterTag, sortDir]);

  return (
    <div
      className={cn(
        "overflow-hidden border",
        dark
          ? "border-white/10 bg-black"
          : "rounded-xl border-slate-200 bg-white shadow-sm"
      )}
    >
      <table className="w-full text-sm">
        <thead
          className={cn(
            "text-xs uppercase tracking-wider",
            dark
              ? "border-b border-white/10 bg-white/[0.03] text-neutral-500"
              : "bg-slate-50 text-slate-500"
          )}
        >
          <tr>
            <th className="px-4 py-3 text-left font-medium">Template</th>
            <th className="px-4 py-3 text-left font-medium">Feature tag</th>
            <th
              className={cn(
                "cursor-pointer px-4 py-3 text-right font-medium select-none",
                dark ? "hover:text-neutral-300" : "hover:text-slate-700"
              )}
              onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
            >
              Total cost {sortDir === "desc" ? "↓" : "↑"}
            </th>
            <th className="px-4 py-3 text-right font-medium">Requests</th>
            <th className="px-4 py-3 text-right font-medium">Avg tokens</th>
          </tr>
        </thead>
        <tbody className={cn(dark ? "divide-y divide-white/5" : "divide-y divide-slate-100")}>
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className={cn(
                  "px-4 py-8 text-center text-sm",
                  dark ? "text-neutral-500" : "text-slate-400"
                )}
              >
                No templates yet.
              </td>
            </tr>
          ) : (
            filtered.map((row) => (
              <tr
                key={row.prompt_hash}
                className={dark ? "hover:bg-white/[0.03]" : "hover:bg-slate-50"}
              >
                <td
                  className={cn(
                    "px-4 py-3 font-mono text-xs",
                    dark ? "text-neutral-400" : "text-slate-700"
                  )}
                >
                  {row.prompt_hash.slice(0, 8)}…
                </td>
                <td className={cn("px-4 py-3", dark ? "text-neutral-300" : "text-slate-700")}>
                  {row.feature_tag ?? "untagged"}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-medium tabular-nums",
                    dark ? "text-white" : "text-slate-900"
                  )}
                >
                  {formatUsd(row.total_cost, 4)}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right tabular-nums",
                    dark ? "text-neutral-400" : "text-slate-700"
                  )}
                >
                  {formatNumber(row.request_count)}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right tabular-nums",
                    dark ? "text-neutral-400" : "text-slate-700"
                  )}
                >
                  {formatNumber(row.avg_tokens)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
