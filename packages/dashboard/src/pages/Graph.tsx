import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ForceGraph2D from "react-force-graph-2d";
import {
  getGraphCurrent,
  setGraphFocus,
  type GraphCurrent,
  type GraphNode,
} from "../lib/api";
import { Skeleton } from "../components/Skeleton";

// Categorical palettes validated with the dataviz six-checks against the
// dashboard surface #0a0b10 (see GRAPHIFY_INTEGRATION.md). Node colors are the
// integration spec's; edge colors are snapped to passing steps — the spec's
// violet/blue edge pair collided under deuteranopia (ΔE 3.8) and its gray had
// no chroma. Fixed assignment by entity, never by rank.
const NODE_COLORS: Record<GraphNode["kind"], string> = {
  file: "#2563EB",
  function: "#16A34A",
  class: "#7C3AED",
  symbol: "#64748B", // not present in trimmed data; safety fallback only
};

type EdgeGroup = "calls" | "imports" | "inherits" | "structure";

const EDGE_COLORS: Record<EdgeGroup, string> = {
  calls: "#EA580C",
  imports: "#3B82F6",
  inherits: "#DB2777",
  structure: "#0D9488",
};

const CRITICAL_RING = "#EAB308";
const SURFACE = "#0a0b10";

function edgeGroup(relation: string): EdgeGroup {
  if (relation === "calls" || relation === "indirect_call") return "calls";
  if (relation === "imports" || relation === "imports_from") return "imports";
  if (relation === "inherits" || relation === "implements") return "inherits";
  return "structure";
}

function degree(node: GraphNode): number {
  return node.inDegree + node.outDegree;
}

// react-force-graph mutates its input (link source/target become node refs,
// nodes gain x/y). Keep our source data immutable by cloning per render pass.
interface SimNode extends GraphNode {
  x?: number;
  y?: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  relation: string;
}

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighborhoodId, setNeighborhoodId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);
  const [focusSet, setFocusSet] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [plotWidth, setPlotWidth] = useState(800);

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

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setPlotWidth(element.offsetWidth));
    observer.observe(element);
    setPlotWidth(element.offsetWidth);
    return () => observer.disconnect();
  }, [data?.available]);

  const nodes = useMemo(() => data?.nodes ?? [], [data]);
  const links = useMemo(() => data?.links ?? [], [data]);
  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  );

  const criticalIds = useMemo(() => {
    const sorted = [...nodes].sort((a, b) => degree(b) - degree(a));
    return new Set(sorted.slice(0, 10).map((node) => node.id));
  }, [nodes]);

  const visible = useMemo(() => {
    let kept = nodes;
    if (neighborhoodId) {
      const neighbors = new Set([neighborhoodId]);
      for (const link of links) {
        if (link.source === neighborhoodId) neighbors.add(link.target);
        if (link.target === neighborhoodId) neighbors.add(link.source);
      }
      kept = kept.filter((node) => neighbors.has(node.id));
    }
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
  }, [nodes, links, kindFilter, scope, search, neighborhoodId, criticalIds]);

  // Fresh clones each time the visible set changes (the simulation mutates them).
  const simData = useMemo(
    () => ({
      nodes: visible.nodes.map((node): SimNode => ({ ...node })),
      links: visible.links.map((link): SimLink => ({ ...link })),
    }),
    [visible]
  );

  const selected = selectedId ? nodesById.get(selectedId) ?? null : null;

  const selectedRelations = useMemo(() => {
    if (!selected) return null;
    const callers: GraphNode[] = [];
    const callees: GraphNode[] = [];
    const importedBy: GraphNode[] = [];
    const importsOut: GraphNode[] = [];
    const neighborIds = new Set<string>();
    for (const link of links) {
      const group = edgeGroup(link.relation);
      if (group !== "calls" && group !== "imports") continue;
      if (link.target === selected.id) {
        const node = nodesById.get(link.source);
        if (!node) continue;
        neighborIds.add(node.id);
        (group === "calls" ? callers : importedBy).push(node);
      } else if (link.source === selected.id) {
        const node = nodesById.get(link.target);
        if (!node) continue;
        neighborIds.add(node.id);
        (group === "calls" ? callees : importsOut).push(node);
      }
    }
    const tests = [...neighborIds]
      .map((id) => nodesById.get(id))
      .filter(
        (node): node is GraphNode =>
          !!node &&
          (node.file.toLowerCase().includes("test") ||
            node.label.toLowerCase().startsWith("test"))
      );
    return { callers, callees, importedBy, imports: importsOut, tests };
  }, [selected, links, nodesById]);

  function nodeSummaryMarkdown(node: GraphNode): string {
    const relations = selectedRelations;
    const lines = [
      `### ${node.label} (${node.file}${node.line ? `:${node.line}` : ""})`,
      `Type: ${node.kind} · ${degree(node)} connections`,
    ];
    if (relations?.callers.length)
      lines.push(`**Called by:** ${relations.callers.map((n) => n.label).join(", ")}`);
    if (relations?.callees.length)
      lines.push(`**Calls:** ${relations.callees.map((n) => n.label).join(", ")}`);
    if (relations?.imports.length)
      lines.push(`**Imports:** ${relations.imports.map((n) => n.label).join(", ")}`);
    if (relations?.importedBy.length)
      lines.push(`**Imported by:** ${relations.importedBy.map((n) => n.label).join(", ")}`);
    if (relations?.tests.length)
      lines.push(`**Tests:** ${relations.tests.map((n) => n.label).join(", ")}`);
    return lines.join("\n");
  }

  async function copySummary(node: GraphNode) {
    await navigator.clipboard.writeText(nodeSummaryMarkdown(node));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function focusNode(node: GraphNode) {
    const root = data?.workspaceRoot ?? "";
    await setGraphFocus(root ? `${root}/${node.file}` : node.file, node.line);
    setFocusSet(true);
    window.setTimeout(() => setFocusSet(false), 1500);
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
        {(neighborhoodId || search || kindFilter !== "all" || scope !== "all") && (
          <button
            type="button"
            onClick={() => {
              setNeighborhoodId(null);
              setSearch("");
              setKindFilter("all");
              setScope("all");
              graphRef.current?.zoomToFit(400, 40);
            }}
            className="rounded-md border border-white/10 px-3 py-1.5 text-neutral-300 hover:bg-white/[0.05]"
          >
            Reset view
          </button>
        )}
        <div className="ml-auto text-xs text-neutral-500">
          {visible.nodes.length.toLocaleString()} nodes · {visible.links.length.toLocaleString()} edges
          {neighborhoodId ? " · neighborhood view" : ""}
        </div>
      </div>

      {/* Legend — identity is never color-alone: detail panel + tables restate it */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-400">
        {(["file", "function", "class"] as const).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: NODE_COLORS[kind] }}
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
      <div className="flex gap-4">
        <div
          ref={containerRef}
          className="min-w-0 flex-1 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]"
        >
          <ForceGraph2D
            ref={graphRef}
            width={plotWidth}
            height={560}
            backgroundColor={SURFACE}
            graphData={simData}
            nodeId="id"
            nodeLabel={(node) => {
              const n = node as SimNode;
              return `${n.label} · ${n.kind} · ${degree(n)} connections<br/>${n.file}${
                n.line ? `:${n.line}` : ""
              }`;
            }}
            nodeVal={(node) => Math.max(1, Math.sqrt(degree(node as SimNode)))}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as SimNode;
              if (n.x === undefined || n.y === undefined) return;
              const radius = Math.max(2.5, Math.sqrt(degree(n)) * 1.1);
              // 2px surface ring so overlapping marks stay separable.
              ctx.beginPath();
              ctx.arc(n.x, n.y, radius + 2 / globalScale, 0, 2 * Math.PI);
              ctx.fillStyle = SURFACE;
              ctx.fill();
              if (criticalIds.has(n.id)) {
                ctx.beginPath();
                ctx.arc(n.x, n.y, radius + 1.5 / globalScale, 0, 2 * Math.PI);
                ctx.fillStyle = CRITICAL_RING;
                ctx.fill();
              }
              ctx.beginPath();
              ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
              ctx.fillStyle = NODE_COLORS[n.kind] ?? NODE_COLORS.symbol;
              ctx.fill();
              if (n.id === selectedId) {
                ctx.lineWidth = 2 / globalScale;
                ctx.strokeStyle = "#f1f3f7";
                ctx.stroke();
              }
              // Selective direct labels: critical-path + selected only.
              if ((criticalIds.has(n.id) && globalScale > 0.9) || n.id === selectedId) {
                ctx.font = `${11 / globalScale}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = "#c7ccd6";
                ctx.fillText(n.label, n.x, n.y + radius + 3 / globalScale);
              }
            }}
            nodePointerAreaPaint={(node, color, ctx) => {
              const n = node as SimNode;
              if (n.x === undefined || n.y === undefined) return;
              // Hit target comfortably larger than the mark.
              ctx.beginPath();
              ctx.arc(n.x, n.y, Math.max(8, Math.sqrt(degree(n)) * 1.1 + 4), 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={(link) =>
              `${EDGE_COLORS[edgeGroup((link as SimLink).relation)]}66`
            }
            linkWidth={1}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onNodeClick={(node) => {
              const id = (node as SimNode).id;
              const now = Date.now();
              const last = lastClickRef.current;
              // Double-click → isolate the node's neighborhood.
              if (last && last.id === id && now - last.at < 350) {
                setNeighborhoodId(id);
                lastClickRef.current = null;
              } else {
                lastClickRef.current = { id, at: now };
              }
              setSelectedId(id);
            }}
            onBackgroundClick={() => setSelectedId(null)}
            cooldownTicks={120}
          />
        </div>

        {/* Node detail panel */}
        {selected && selectedRelations && (
          <aside className="w-80 shrink-0 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 text-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Selected
            </div>
            <div className="mt-1 break-words text-base font-semibold text-neutral-100">
              {selected.label}
            </div>
            <dl className="mt-3 space-y-1 text-xs text-neutral-400">
              <Row label="File" value={selected.file + (selected.line ? `:${selected.line}` : "")} />
              <Row label="Type" value={selected.kind} />
              <Row label="Degree" value={`${degree(selected)} connections (${selected.inDegree} in / ${selected.outDegree} out)`} />
            </dl>
            <RelationList title={`Callers (${selectedRelations.callers.length})`} nodes={selectedRelations.callers} onSelect={setSelectedId} />
            <RelationList title={`Callees (${selectedRelations.callees.length})`} nodes={selectedRelations.callees} onSelect={setSelectedId} />
            <RelationList title={`Imported by (${selectedRelations.importedBy.length})`} nodes={selectedRelations.importedBy} onSelect={setSelectedId} />
            <RelationList title={`Imports (${selectedRelations.imports.length})`} nodes={selectedRelations.imports} onSelect={setSelectedId} />
            <RelationList title={`Tests (${selectedRelations.tests.length})`} nodes={selectedRelations.tests} onSelect={setSelectedId} />

            <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
              <div className="font-medium text-neutral-300">Veyr insight</div>
              {selected.kind === "function" && degree(selected) <= 2 ? (
                <p className="mt-1 text-neutral-400">
                  ⚡ Low connectivity — a leaf function. Consider claude-haiku-4-5 for edits here.
                </p>
              ) : degree(selected) > 20 ? (
                <p className="mt-1 text-neutral-400">
                  ⚠️ {degree(selected)} connections — changes ripple widely. Write a test first.
                </p>
              ) : (
                <p className="mt-1 text-neutral-400">
                  {degree(selected)} connections — moderate impact.
                </p>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void copySummary(selected)}
                className="flex-1 rounded-md border border-white/10 px-2 py-1.5 text-xs text-neutral-300 hover:bg-white/[0.05]"
              >
                {copied ? "Copied ✓" : "Copy node summary"}
              </button>
              <button
                type="button"
                onClick={() => void focusNode(selected)}
                className="flex-1 rounded-md border border-[#5b8def]/30 bg-[#5b8def]/10 px-2 py-1.5 text-xs text-[#9cc0ff] hover:bg-[#5b8def]/20"
              >
                {focusSet ? "Focus set ✓" : "Set as focus"}
              </button>
            </div>
          </aside>
        )}
      </div>

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
                    onClick={() => setSelectedId(node.id)}
                  >
                    <td className="py-1.5 pr-4">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: NODE_COLORS[node.kind] }}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-neutral-600">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}

function RelationList({
  title,
  nodes,
  onSelect,
}: {
  title: string;
  nodes: GraphNode[];
  onSelect: (id: string) => void;
}) {
  if (nodes.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">{title}</div>
      <ul className="mt-1 space-y-0.5 text-xs">
        {nodes.slice(0, 8).map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => onSelect(node.id)}
              className="text-left text-neutral-300 hover:text-[#9cc0ff]"
            >
              {node.label}
              <span className="ml-1 text-neutral-600">({node.file.split("/").pop()})</span>
            </button>
          </li>
        ))}
        {nodes.length > 8 && (
          <li className="text-neutral-600">+{nodes.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}
