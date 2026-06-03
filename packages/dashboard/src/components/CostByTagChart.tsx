import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ByTagRow } from "../lib/api";

interface CostByTagChartProps {
  data: ByTagRow[];
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
}

const COLOR = "#6366f1";
const COLOR_DIM = "#c7d2fe";
const COLOR_SELECTED = "#4338ca";

export function CostByTagChart({ data, selectedTag, onSelect }: CostByTagChartProps) {
  const top = data.slice(0, 8);

  if (top.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-400">
        No requests yet — point your SDK at the proxy to see data.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={top}
          layout="vertical"
          margin={{ top: 8, right: 16, left: 16, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: "#64748b" }}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <YAxis
            type="category"
            dataKey="feature_tag"
            tick={{ fontSize: 12, fill: "#0f172a" }}
            width={140}
          />
          <Tooltip
            formatter={(value: number) => [`$${Number(value).toFixed(4)}`, "Cost"]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="cost"
            cursor="pointer"
            onClick={(entry: { feature_tag?: string }) => {
              const tag = entry.feature_tag ?? null;
              onSelect(tag === selectedTag ? null : tag);
            }}
          >
            {top.map((row) => {
              const fill =
                selectedTag == null
                  ? COLOR
                  : row.feature_tag === selectedTag
                  ? COLOR_SELECTED
                  : COLOR_DIM;
              return <Cell key={row.feature_tag} fill={fill} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
