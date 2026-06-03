import { useMemo, useState } from "react";
import type { TopTemplateRow } from "../lib/api";
import { formatNumber, formatUsd } from "../lib/format";

interface TopTemplatesTableProps {
  rows: TopTemplateRow[];
  filterTag: string | null;
}

type SortDir = "asc" | "desc";

export function TopTemplatesTable({ rows, filterTag }: TopTemplatesTableProps) {
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    const list = filterTag
      ? rows.filter((r) => r.feature_tag === filterTag)
      : rows;
    return [...list].sort((a, b) =>
      sortDir === "desc" ? b.total_cost - a.total_cost : a.total_cost - b.total_cost
    );
  }, [rows, filterTag, sortDir]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Template</th>
            <th className="px-4 py-3 text-left font-medium">Feature tag</th>
            <th
              className="cursor-pointer px-4 py-3 text-right font-medium select-none hover:text-slate-700"
              onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
            >
              Total cost {sortDir === "desc" ? "↓" : "↑"}
            </th>
            <th className="px-4 py-3 text-right font-medium">Requests</th>
            <th className="px-4 py-3 text-right font-medium">Avg tokens</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                className="px-4 py-8 text-center text-sm text-slate-400"
              >
                No templates yet.
              </td>
            </tr>
          ) : (
            filtered.map((row) => (
              <tr key={row.prompt_hash} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs text-slate-700">
                  {row.prompt_hash.slice(0, 8)}…
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {row.feature_tag ?? "untagged"}
                </td>
                <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                  {formatUsd(row.total_cost, 4)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatNumber(row.request_count)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
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
