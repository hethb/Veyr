import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { getCacheStats, type CacheFeatureRow, type CacheStats, type Period } from "../lib/api";
import { chartColors } from "../lib/chartTheme";
import { formatNumber, formatUsd } from "../lib/format";
import { Skeleton } from "./Skeleton";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-md";

const periods: Period[] = ["7d", "30d"];

export function CachePanel() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    getCacheStats(period)
      .then((d) => {
        if (!cancel) setData(d);
      })
      .catch((e: unknown) => {
        if (!cancel) setError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [period]);

  return (
    <section className={panelClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#7fa8ee]">
            Layer 2 · provider prompt caching
          </p>
          <h2 className="mt-1 text-base font-semibold text-white">Cache impact</h2>
          <p className="mt-1 max-w-xl text-sm text-neutral-500">
            Tokens served from a provider cache pay ~10% (Anthropic) or ~50% (OpenAI)
            of the regular input rate. We track the net dollar saving here.
          </p>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </div>

      {error ? (
        <div className="mt-5 rounded-lg border border-rose-400/25 bg-rose-400/[0.08] px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : loading || !data ? (
        <CacheSkeleton />
      ) : data.cached_tokens === 0 && data.cache_creation_tokens === 0 ? (
        <EmptyState totalRequests={data.total_requests} />
      ) : (
        <CacheBody data={data} />
      )}
    </section>
  );
}

function CacheBody({ data }: { data: CacheStats }) {
  const cachedShare =
    data.total_prompt_tokens > 0
      ? data.cached_tokens / data.total_prompt_tokens
      : 0;
  const savingsPct =
    data.baseline_input_cost_usd > 0
      ? data.net_savings_usd / data.baseline_input_cost_usd
      : 0;

  return (
    <>
      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile
          label="Net saved"
          value={formatUsd(Math.max(0, data.net_savings_usd), 2)}
          subline={
            savingsPct > 0
              ? `${(savingsPct * 100).toFixed(1)}% off input bill`
              : "before write premium"
          }
          tone={data.net_savings_usd > 0 ? "positive" : "neutral"}
        />
        <StatTile
          label="Cache hit rate"
          value={`${(data.hit_rate * 100).toFixed(1)}%`}
          subline={`${formatNumber(data.cache_using_requests)} of ${formatNumber(
            data.total_requests
          )} requests`}
        />
        <StatTile
          label="Tokens from cache"
          value={formatNumber(data.cached_tokens)}
          subline={`${(cachedShare * 100).toFixed(1)}% of all input`}
        />
        <StatTile
          label="Cache writes"
          value={formatNumber(data.cache_creation_tokens)}
          subline={
            data.write_premium_usd > 0
              ? `+${formatUsd(data.write_premium_usd, 2)} write premium`
              : "no writes yet"
          }
          tone="muted"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium text-white">Savings over time</h3>
          <SavingsTimeChart timeseries={data.timeseries} />
        </div>
        <div>
          <h3 className="text-sm font-medium text-white">Hit rate by feature</h3>
          <FeatureHitRateChart rows={data.by_feature} />
        </div>
      </div>

      <FeatureTable rows={data.by_feature} />
    </>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  subline: string;
  tone?: "positive" | "neutral" | "muted";
}

function StatTile({ label, value, subline, tone = "neutral" }: StatTileProps) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "positive"
            ? "text-emerald-300"
            : tone === "muted"
              ? "text-neutral-300"
              : "text-white"
        )}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-neutral-500">{subline}</div>
    </div>
  );
}

function SavingsTimeChart({ timeseries }: { timeseries: CacheStats["timeseries"] }) {
  const colors = chartColors.dark;
  const empty = timeseries.every((p) => p.savings_usd === 0);

  if (empty) {
    return (
      <div className="mt-3 flex h-56 items-center justify-center rounded-lg border border-dashed border-white/[0.08] text-xs text-neutral-500">
        No daily savings yet.
      </div>
    );
  }

  return (
    <div className="mt-3 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={timeseries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="cacheSavingsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: colors.axis }}
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: colors.axis }}
            tickFormatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <Tooltip
            formatter={(value: number) => [`$${Number(value).toFixed(4)}`, "Saved"]}
            labelStyle={{ color: colors.tooltipLabel }}
            contentStyle={{
              borderRadius: 0,
              border: `1px solid ${colors.tooltipBorder}`,
              backgroundColor: colors.tooltipBg,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="savings_usd"
            stroke="#34d399"
            strokeWidth={2}
            fill="url(#cacheSavingsGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function FeatureHitRateChart({ rows }: { rows: CacheFeatureRow[] }) {
  const colors = chartColors.dark;
  // Include rows that have any prompt traffic, even at 0% hit rate — the gap
  // is precisely the opportunity the user should see.
  const data = useMemo(
    () =>
      rows
        .filter((r) => r.prompt_tokens > 0)
        .slice(0, 8)
        .map((r) => ({
          feature_tag: r.feature_tag,
          hit_rate_pct: Math.round(r.hit_rate * 1000) / 10,
          savings_usd: r.net_savings_usd,
        })),
    [rows]
  );

  if (data.length === 0) {
    return (
      <div className="mt-3 flex h-56 items-center justify-center rounded-lg border border-dashed border-white/[0.08] text-xs text-neutral-500">
        No feature traffic in this window.
      </div>
    );
  }

  return (
    <div className="mt-3 h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: colors.axis }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="feature_tag"
            tick={{ fontSize: 11, fill: colors.axisLabel }}
            width={130}
          />
          <Tooltip
            formatter={(value: number, key: string) =>
              key === "hit_rate_pct"
                ? [`${value.toFixed(1)}%`, "Hit rate"]
                : [value.toString(), key]
            }
            contentStyle={{
              borderRadius: 0,
              border: `1px solid ${colors.tooltipBorder}`,
              backgroundColor: colors.tooltipBg,
              color: colors.tooltipLabel,
              fontSize: 12,
            }}
          />
          <Bar dataKey="hit_rate_pct">
            {data.map((row) => (
              <Cell
                key={row.feature_tag}
                fill={
                  row.hit_rate_pct >= 50
                    ? "#34d399"
                    : row.hit_rate_pct >= 20
                      ? "#60a5fa"
                      : "#f59e0b"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FeatureTable({ rows }: { rows: CacheFeatureRow[] }) {
  const interesting = rows.filter(
    (r) => r.prompt_tokens > 0 && (r.cached_tokens > 0 || r.cache_creation_tokens > 0 || r.prompt_tokens > 5000)
  );

  if (interesting.length === 0) return null;

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-neutral-500">
          <tr className="border-b border-white/[0.07]">
            <th className="py-2 pr-4 font-medium">Feature</th>
            <th className="py-2 pr-4 font-medium tabular-nums">Input tokens</th>
            <th className="py-2 pr-4 font-medium tabular-nums">From cache</th>
            <th className="py-2 pr-4 font-medium tabular-nums">Hit rate</th>
            <th className="py-2 pr-4 font-medium tabular-nums">Net saved</th>
          </tr>
        </thead>
        <tbody>
          {interesting.map((r) => {
            const pct = (r.hit_rate * 100).toFixed(1);
            const positive = r.net_savings_usd > 0;
            const opportunity =
              r.hit_rate < 0.05 && r.prompt_tokens >= 5000;
            return (
              <tr
                key={r.feature_tag}
                className="border-b border-white/[0.04] text-neutral-300"
              >
                <td className="py-2 pr-4 font-mono text-[13px] text-neutral-200">
                  {r.feature_tag}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {formatNumber(r.prompt_tokens)}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  {formatNumber(r.cached_tokens)}
                </td>
                <td className="py-2 pr-4 tabular-nums">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      r.hit_rate >= 0.5
                        ? "bg-emerald-500/15 text-emerald-300"
                        : r.hit_rate >= 0.2
                          ? "bg-sky-500/15 text-sky-300"
                          : opportunity
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-white/[0.04] text-neutral-400"
                    )}
                  >
                    {pct}%
                    {opportunity && " · opportunity"}
                  </span>
                </td>
                <td
                  className={cn(
                    "py-2 pr-4 tabular-nums",
                    positive ? "text-emerald-300" : "text-neutral-400"
                  )}
                >
                  {positive ? "+" : ""}
                  {formatUsd(r.net_savings_usd, 4)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ totalRequests }: { totalRequests: number }) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-white/[0.12] bg-white/[0.015] px-5 py-8 text-sm text-neutral-400">
      <p className="font-medium text-neutral-200">No cache activity yet.</p>
      <p className="mt-1 text-neutral-500">
        {totalRequests > 0
          ? `${formatNumber(totalRequests)} requests in this window — none used a provider cache. `
          : "No requests have been logged yet. "}
        Flip <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-neutral-200">x-promptlens-cache: 1</code>{" "}
        on a feature with a long, repeated system prompt, or enable the{" "}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs text-neutral-200">enable_prompt_caching</code>{" "}
        policy. Up to 90% input cost reduction on repeated calls.
      </p>
    </div>
  );
}

function CacheSkeleton() {
  return (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}

interface PeriodToggleProps {
  value: Period;
  onChange: (p: Period) => void;
}

function PeriodToggle({ value, onChange }: PeriodToggleProps) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-medium">
      {periods.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={cn(
            "px-3 py-1.5 transition-colors",
            value === p
              ? "bg-[#3f6fd8] text-white"
              : "text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-100"
          )}
        >
          {p}
        </button>
      ))}
    </div>
  );
}
