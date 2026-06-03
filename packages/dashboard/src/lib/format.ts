export function formatUsd(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return "$0.0000";
  return `$${value.toFixed(decimals)}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US");
}

export function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
