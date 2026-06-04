export type ChartTheme = "light" | "dark";

export const chartColors = {
  light: {
    primary: "#6366f1",
    primaryDim: "#c7d2fe",
    primarySelected: "#4338ca",
    grid: "#e2e8f0",
    axis: "#64748b",
    axisLabel: "#0f172a",
    tooltipBorder: "#e2e8f0",
    tooltipLabel: "#0f172a",
    tooltipBg: "#ffffff",
  },
  dark: {
    primary: "#076EFF",
    primaryDim: "#1a3050",
    primarySelected: "#4FABFF",
    grid: "#ffffff14",
    axis: "#737373",
    axisLabel: "#d4d4d4",
    tooltipBorder: "#ffffff20",
    tooltipLabel: "#fafafa",
    tooltipBg: "#0a0a0a",
  },
} as const;
