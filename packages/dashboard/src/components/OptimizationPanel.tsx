import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getOptimizationStats,
  type OptimizationStats,
  type Period,
} from "../lib/api";
import { formatNumber, formatUsd } from "../lib/format";
import { Skeleton } from "./Skeleton";

const panelClass =
  "rounded-xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-md";

const periods: Period[] = ["7d", "30d"];

const TECHNIQUE_LABELS: Record<string, string> = {
  filler_phrase_removal: "Filler phrase removal",
  blank_line_collapse: "Blank line collapse",
  comment_removal: "Comment removal",
  role_boilerplate_removal: "Role boilerplate removal",
  bullet_list_inlining: "Bullet list inlining",
  summary_header_removal: "Summary header removal",
  greeting_signoff_removal: "Greeting/signoff removal",
  cache_injection: "Cache injection",
  conversation_trimming: "Conversation trimming",
};

export function OptimizationPanel() {
  const [period, setPeriod] = useState<Period>("30d");
  const [data, setData] = useState<OptimizationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setError(null);
    getOptimizationStats(period)
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
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">
            Optimization
          </h2>
          <p className="mt-1 text-xs text-neutral-600">
            Complexity-aware compression, cache injection, and where the savings
            come from.
          </p>
        </div>
        <div className="flex gap-1">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-white/10 text-white"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading && <Skeleton className="h-64 w-full rounded-xl" />}
      {error && (
        <div className={panelClass}>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className={panelClass}>
              <p className="text-xs text-neutral-500">Tokens saved</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatNumber(data.tokens_saved)}
              </p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-neutral-500">Compression ratio</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {data.compression_ratio_pct}%
              </p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-neutral-500">Cache hits</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatNumber(data.cache_hits)}
              </p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-neutral-500">Cost avoided</p>
              <p className="mt-1 text-xl font-semibold text-emerald-400">
                {formatUsd(data.cost_avoided_usd)}
              </p>
            </div>
          </div>

          {/* Part 7 technique cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className={panelClass}>
              <p className="text-xs text-neutral-500">Conversation turns trimmed</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatNumber(data.turns_trimmed)}
              </p>
              <p className="mt-0.5 text-[10px] text-neutral-600">
                {formatNumber(data.trim_tokens_saved)} tokens saved
              </p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-neutral-500">Batch-eligible requests</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatNumber(data.batch_eligible_requests)}
              </p>
              <p className="mt-0.5 text-[10px] text-neutral-600">
                50% cheaper via OpenAI Batch API
              </p>
            </div>
            <div className={panelClass}>
              <p className="text-xs text-neutral-500">Verbose JSON examples flagged</p>
              <p className="mt-1 text-xl font-semibold text-white">
                {formatNumber(data.structured_output_candidates)}
              </p>
              <p className="mt-0.5 text-[10px] text-neutral-600">
                switch to structured outputs (~30% less input)
              </p>
            </div>
          </div>

          {/* Original vs optimized tokens over time */}
          <div className={panelClass}>
            <p className="mb-3 text-xs font-medium text-neutral-400">
              Prompt tokens: original vs optimized (area between = savings)
            </p>
            {data.series.length === 0 ? (
              <p className="py-8 text-center text-sm text-neutral-600">
                No optimized traffic in this period yet. Enable compression with
                the <code>x-veyr-compress: 1</code> header or a feature policy.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis
                    dataKey="bucket"
                    tick={{ fontSize: 10, fill: "#737373" }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#737373" }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0a0a0a",
                      border: "1px solid #ffffff20",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="original_tokens"
                    name="Original"
                    stroke="#B1C5FF"
                    fill="#B1C5FF"
                    fillOpacity={0.25}
                  />
                  <Area
                    type="monotone"
                    dataKey="optimized_tokens"
                    name="Optimized"
                    stroke="#076EFF"
                    fill="#000000"
                    fillOpacity={0.55}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* Top opportunities table */}
            <div className={panelClass}>
              <p className="mb-3 text-xs font-medium text-neutral-400">
                Top opportunities by feature tag
              </p>
              {data.by_tag.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-600">
                  Nothing to rank yet.
                </p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="pb-2 font-medium">Feature tag</th>
                      <th className="pb-2 text-right font-medium">Avg reduction</th>
                      <th className="pb-2 text-right font-medium">Requests</th>
                      <th className="pb-2 text-right font-medium">Savings</th>
                    </tr>
                  </thead>
                  <tbody className="text-neutral-300">
                    {data.by_tag.map((row) => (
                      <tr key={row.feature_tag} className="border-t border-white/5">
                        <td className="py-2">{row.feature_tag}</td>
                        <td className="py-2 text-right">{row.avg_reduction_pct}%</td>
                        <td className="py-2 text-right">
                          {formatNumber(row.requests)}
                        </td>
                        <td className="py-2 text-right text-emerald-400">
                          {formatUsd(row.monthly_savings_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Technique breakdown */}
            <div className={panelClass}>
              <p className="mb-3 text-xs font-medium text-neutral-400">
                Token savings by technique
              </p>
              {data.techniques.length === 0 ? (
                <p className="py-6 text-center text-sm text-neutral-600">
                  No techniques recorded yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    layout="vertical"
                    data={data.techniques.map((t) => ({
                      ...t,
                      label: TECHNIQUE_LABELS[t.name] ?? t.name,
                    }))}
                    margin={{ left: 40 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: "#737373" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={140}
                      tick={{ fontSize: 10, fill: "#a3a3a3" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0a0a0a",
                        border: "1px solid #ffffff20",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey="tokens_saved"
                      name="Tokens saved"
                      fill="#4FABFF"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
