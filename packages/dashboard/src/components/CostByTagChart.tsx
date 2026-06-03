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
import { chartColors, type ChartTheme } from "../lib/chartTheme";

interface CostByTagChartProps {
  data: ByTagRow[];
  selectedTag: string | null;
  onSelect: (tag: string | null) => void;
  theme?: ChartTheme;
}

export function CostByTagChart({
  data,
  selectedTag,
  onSelect,
  theme = "light",
}: CostByTagChartProps) {
  const colors = chartColors[theme];
  const top = data.slice(0, 8);

  if (top.length === 0) {
    return (
      <div
        className={`flex h-72 items-center justify-center text-sm ${
          theme === "dark" ? "text-neutral-500" : "text-slate-400"
        }`}
      >
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
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            type="number"
            tick={{ fontSize: 12, fill: colors.axis }}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <YAxis
            type="category"
            dataKey="feature_tag"
            tick={{ fontSize: 12, fill: colors.axisLabel }}
            width={140}
          />
          <Tooltip
            formatter={(value: number) => [`$${Number(value).toFixed(4)}`, "Cost"]}
            contentStyle={{
              borderRadius: 0,
              border: `1px solid ${colors.tooltipBorder}`,
              backgroundColor:
                theme === "dark" ? colors.tooltipBg : "#ffffff",
              color: colors.tooltipLabel,
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
                  ? colors.primary
                  : row.feature_tag === selectedTag
                    ? colors.primarySelected
                    : colors.primaryDim;
              return <Cell key={row.feature_tag} fill={fill} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
