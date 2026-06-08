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
    primary: "#5b8def",
    primaryDim: "#2b3650",
    primarySelected: "#8fb6ff",
    grid: "#ffffff0d",
    axis: "#8a8f99",
    axisLabel: "#c7ccd6",
    tooltipBorder: "#ffffff1a",
    tooltipLabel: "#f1f3f7",
    tooltipBg: "#12141b",
  },
} as const;
