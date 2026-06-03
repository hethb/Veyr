import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeseriesPoint } from "../lib/api";
import { chartColors, type ChartTheme } from "../lib/chartTheme";

interface CostTimeChartProps {
  data: TimeseriesPoint[];
  theme?: ChartTheme;
}

export function CostTimeChart({ data, theme = "light" }: CostTimeChartProps) {
  const colors = chartColors[theme];
  const gradientId = `costGradient-${theme}`;

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.primary} stopOpacity={0.35} />
              <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: colors.axis }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 12, fill: colors.axis }}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <Tooltip
            formatter={(value: number) => [`$${Number(value).toFixed(4)}`, "Cost"]}
            labelStyle={{ color: colors.tooltipLabel }}
            contentStyle={{
              borderRadius: 0,
              border: `1px solid ${colors.tooltipBorder}`,
              backgroundColor:
                theme === "dark" ? colors.tooltipBg : "#ffffff",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="cost"
            stroke={colors.primary}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
