import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getGraphCurrent,
  setGraphFocus,
  type GraphCurrent,
  type GraphNode,
} from "../lib/api";
import { Skeleton } from "../components/Skeleton";
import {
  computeCriticalIds,
  degree,
  nodeColor,
  CRITICAL_RING,
  EDGE_COLORS,
  GraphCanvas,
  type EdgeGroup,
  type GraphCanvasHandle,
} from "../components/GraphCanvas";

type KindFilter = "all" | "file" | "function" | "class";
type ScopeFilter = "all" | "critical";

interface RuleRow {
  rule: string;
  idPrefix: string;
  technique: string;
  kind: "savings" | "risk";
}

const RULE_ROWS: RuleRow[] = [
  { rule: "G1", idPrefix: "g1-", technique: "Leaf node routing", kind: "savings" },
  { rule: "G4", idPrefix: "g4-", technique: "Redundant reads", kind: "savings" },
  { rule: "G3", idPrefix: "g3-", technique: "Unexplored deps", kind: "savings" },
  { rule: "G2", idPrefix: "g2-", technique: "God node warning", kind: "risk" },
  { rule: "G5", idPrefix: "g5-", technique: "Test gap", kind: "risk" },
];

export function Graph() {
  const [data, setData] = useState<GraphCurrent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [search, setSearch] = useState("");

  const graphCanvasRef = useRef<GraphCanvasHandle>(null);

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true);
    try {
      setData(await getGraphCurrent());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reach the proxy");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  // A partial graph resolves into the full one shortly — poll while partial.
  useEffect(() => {
    if (!data?.available || !data.isPartial) return;
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [data?.available, data?.isPartial, load]);

  const nodes = useMemo(() => data?.nodes ?? [], [data]);
  const links = useMemo(() => data?.links ?? [], [data]);

  const criticalIds = useMemo(() => computeCriticalIds(nodes), [nodes]);

  const visible = useMemo(() => {
    let kept = nodes;
    if (kindFilter !== "all") kept = kept.filter((node) => node.kind === kindFilter);
    if (scope === "critical") kept = kept.filter((node) => criticalIds.has(node.id));
    const query = search.trim().toLowerCase();
    if (query) {
      kept = kept.filter(
        (node) =>
          node.label.toLowerCase().includes(query) ||
          node.file.toLowerCase().includes(query)
      );
    }
    const keptIds = new Set(kept.map((node) => node.id));
    const keptLinks = links.filter(
      (link) => keptIds.has(link.source) && keptIds.has(link.target)
    );
    return { nodes: kept, links: keptLinks };
  }, [nodes, links, kindFilter, scope, search, criticalIds]);

  async function focusNode(node: GraphNode) {
    const root = data?.workspaceRoot ?? "";
    await setGraphFocus(root ? `${root}/${node.file}` : node.file, node.line);
  }

  const savings = data?.summary?.token_savings_estimate;
  const activeRecommendations = data?.recommendations ?? [];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data?.available) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Codebase graph</h1>
        <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.025] p-8 text-center">
          <div className="text-lg text-neutral-300">
            {error ? "Can't reach the Veyr proxy" : "No graph available yet"}
          </div>
          <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
            {error
              ? `The dashboard reads the graph through the local proxy. (${error})`
              : data?.reason === "graph_not_built"
                ? "The Veyr Mac app builds the graph automatically when a coding session is active. Open a project with Claude Code and check back in a minute."
                : "Graph features need Python 3.10+ and the Veyr Mac app running."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Codebase graph</h1>
        <div className="text-xs text-neutral-500">
          {data.workspaceRoot} · Graphify {data.graphifyVersion}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SummaryCard label="Files analyzed" value={String(data.fileCount ?? 0)} />
        <SummaryCard
          label="Nodes"
          value={(data.totalNodeCount ?? 0).toLocaleString()}
          hint={
            (data.nodes?.length ?? 0) < (data.totalNodeCount ?? 0)
              ? `top ${data.nodes?.length.toLocaleString()} shown`
              : undefined
          }
        />
        <SummaryCard label="Edges" value={(data.totalLinkCount ?? 0).toLocaleString()} />
        <SummaryCard
          label="Graph savings / month"
          value={savings ? `~${savings.savings_this_month.toLocaleString()} tok` : "—"}
          hint={savings ? `${savings.savings_this_session.toLocaleString()} tok per session` : undefined}
        />
      </div>

      {data.isPartial && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
          <span aria-hidden>⚡</span>
          Partial graph active
          {data.partialSubdirectory ? ` (${data.partialSubdirectory}/ only)` : ""} — full
          build in progress; this page refreshes automatically.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <FilterGroup
          value={kindFilter}
          onChange={(value) => setKindFilter(value)}
          options={[
            ["all", "All"],
            ["file", "Files"],
            ["function", "Functions"],
            ["class", "Classes"],
          ]}
        />
        <FilterGroup
          value={scope}
          onChange={(value) => setScope(value)}
          options={[
            ["all", "Everything"],
            ["critical", "Critical path"],
          ]}
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search nodes…"
          className="w-52 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-neutral-200 placeholder:text-neutral-600 focus:border-[#5b8def]/50 focus:outline-none"
        />
        {(search || kindFilter !== "all" || scope !== "all") && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setKindFilter("all");
              setScope("all");
              graphCanvasRef.current?.resetView();
            }}
            className="rounded-md border border-white/10 px-3 py-1.5 text-neutral-300 hover:bg-white/[0.05]"
          >
            Reset view
          </button>
        )}
        <div className="ml-auto text-xs text-neutral-500">
          {visible.nodes.length.toLocaleString()} nodes · {visible.links.length.toLocaleString()} edges
        </div>
      </div>

      {/* Legend — identity is never color-alone: detail panel + tables restate it */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-400">
        {(["file", "function", "class"] as const).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: nodeColor(kind) }}
            />
            {kind}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full border-2"
            style={{ borderColor: CRITICAL_RING }}
          />
          critical path
        </span>
        <span className="mx-1 text-neutral-700">|</span>
        {(Object.keys(EDGE_COLORS) as EdgeGroup[]).map((group) => (
          <span key={group} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-0.5 w-4"
              style={{ backgroundColor: EDGE_COLORS[group] }}
            />
            {group}
          </span>
        ))}
      </div>

      {/* Graph + detail panel */}
      <GraphCanvas
        ref={graphCanvasRef}
        nodes={visible.nodes}
        links={visible.links}
        onFocusNode={(node) => void focusNode(node as GraphNode)}
      />

      {/* Top nodes (table view of the same data — never color-alone) */}
      <section className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-neutral-200">Highest-impact nodes</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="py-1.5 pr-4 font-medium">Node</th>
                <th className="py-1.5 pr-4 font-medium">Type</th>
                <th className="py-1.5 pr-4 font-medium">File</th>
                <th className="py-1.5 text-right font-medium">Connections</th>
              </tr>
            </thead>
            <tbody className="text-neutral-300">
              {[...nodes]
                .sort((a, b) => degree(b) - degree(a))
                .slice(0, 12)
                .map((node) => (
                  <tr
                    key={node.id}
                    className="cursor-pointer border-t border-white/[0.05] hover:bg-white/[0.03]"
                    onClick={() => graphCanvasRef.current?.selectNode(node.id)}
                  >
                    <td className="py-1.5 pr-4">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: nodeColor(node.kind) }}
                        aria-hidden
                      />
                      {node.label}
                    </td>
                    <td className="py-1.5 pr-4 text-neutral-400">{node.kind}</td>
                    <td className="max-w-md truncate py-1.5 pr-4 text-neutral-500">{node.file}</td>
                    <td className="py-1.5 text-right tabular-nums">{degree(node)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Optimization opportunities */}
      <section className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
        <h2 className="text-sm font-semibold text-neutral-200">Optimization opportunities</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="py-1.5 pr-4 font-medium">Technique</th>
                <th className="py-1.5 pr-4 font-medium">Status</th>
                <th className="py-1.5 pr-4 font-medium">Monthly savings</th>
                <th className="py-1.5 font-medium">Rule</th>
              </tr>
            </thead>
            <tbody className="text-neutral-300">
              {RULE_ROWS.map((row) => {
                const active = activeRecommendations.find((rec) =>
                  rec.id.startsWith(row.idPrefix)
                );
                const monthly = active
                  ? active.estimated_savings_per_hour_usd * 720
                  : 0;
                return (
                  <tr key={row.rule} className="border-t border-white/[0.05]">
                    <td className="py-1.5 pr-4">
                      <Link to="/dashboard" className="hover:text-[#9cc0ff]" title={active?.reason}>
                        {row.technique}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-4">
                      {active ? (
                        <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-xs text-emerald-300">
                          {row.kind === "risk" ? "Alert" : "Active"}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-600">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-4 tabular-nums">
                      {row.kind === "risk"
                        ? "— (risk)"
                        : active && monthly > 0
                          ? `$${monthly.toFixed(2)}`
                          : "—"}
                    </td>
                    <td className="py-1.5 text-neutral-500">{row.rule}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-md">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-neutral-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

function FilterGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-white/10">
      {options.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`px-3 py-1.5 text-sm transition-colors ${
            value === key
              ? "bg-[#5b8def]/15 text-[#9cc0ff]"
              : "text-neutral-400 hover:bg-white/[0.04]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
