import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

// Categorical palettes validated with the dataviz six-checks against the
// dashboard surface #0a0b10 (see GRAPHIFY_INTEGRATION.md). Node colors are the
// integration spec's; edge colors are snapped to passing steps — the spec's
// violet/blue edge pair collided under deuteranopia (ΔE 3.8) and its gray had
// no chroma. Fixed assignment by entity, never by rank.
//
// This is the one graph-rendering implementation shared by the dashboard page
// (`pages/Graph.tsx`), the VS Code webview panel, and the Mac app's WKWebView
// window (via `src/embed`) — surfaces differ in how they source data and what
// they do with a "focus" click, never in how the graph looks or behaves.
const KNOWN_NODE_COLORS: Record<string, string> = {
  file: "#2563EB",
  function: "#16A34A",
  class: "#7C3AED",
  symbol: "#64748B",
};
const DEFAULT_NODE_COLOR = KNOWN_NODE_COLORS.symbol;

export function nodeColor(kind: string): string {
  return KNOWN_NODE_COLORS[kind] ?? DEFAULT_NODE_COLOR;
}

export type EdgeGroup = "calls" | "imports" | "inherits" | "structure";

export const EDGE_COLORS: Record<EdgeGroup, string> = {
  calls: "#EA580C",
  imports: "#3B82F6",
  inherits: "#DB2777",
  structure: "#0D9488",
};

export const CRITICAL_RING = "#EAB308";
export const SURFACE = "#0a0b10";

export function edgeGroup(relation: string): EdgeGroup {
  if (relation === "calls" || relation === "indirect_call") return "calls";
  if (relation === "imports" || relation === "imports_from") return "imports";
  if (relation === "inherits" || relation === "implements") return "inherits";
  return "structure";
}

export interface GraphCanvasNode {
  id: string;
  label: string;
  kind: string;
  file: string;
  line?: number | null;
  community?: number | null;
  inDegree: number;
  outDegree: number;
}

export interface GraphCanvasLink {
  source: string;
  target: string;
  relation: string;
}

export function degree(node: Pick<GraphCanvasNode, "inDegree" | "outDegree">): number {
  return node.inDegree + node.outDegree;
}

/** Top-N nodes by total degree — the same set the dashboard rings and the CLI's top-connections list use. */
export function computeCriticalIds(nodes: readonly GraphCanvasNode[], limit = 10): Set<string> {
  const sorted = [...nodes].sort((a, b) => degree(b) - degree(a));
  return new Set(sorted.slice(0, limit).map((node) => node.id));
}

// react-force-graph mutates its input (link source/target become node refs,
// nodes gain x/y). Keep our source data immutable by cloning per render pass.
interface SimNode extends GraphCanvasNode {
  x?: number;
  y?: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  relation: string;
}

export interface GraphCanvasHandle {
  /** Clears any neighborhood isolation and re-fits the view — call this from a host-level "Reset view" control too. */
  resetView: () => void;
  /** Selects a node from outside the canvas — e.g. a row click in a host-level table view of the same data. */
  selectNode: (id: string) => void;
}

export interface GraphCanvasProps {
  nodes: readonly GraphCanvasNode[];
  links: readonly GraphCanvasLink[];
  height?: number;
  /** "Set as focus" in the detail panel — omit to hide the button entirely. */
  onFocusNode?: (node: GraphCanvasNode) => void;
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  { nodes, links, height = 560, onFocusNode },
  ref
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [neighborhoodId, setNeighborhoodId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [focusSet, setFocusSet] = useState(false);
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [plotWidth, setPlotWidth] = useState(800);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setPlotWidth(element.offsetWidth));
    observer.observe(element);
    setPlotWidth(element.offsetWidth);
    return () => observer.disconnect();
  }, []);

  const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const criticalIds = useMemo(() => computeCriticalIds(nodes), [nodes]);

  const clearNeighborhood = () => {
    setNeighborhoodId(null);
    graphRef.current?.zoomToFit(400, 40);
  };

  useImperativeHandle(ref, () => ({
    resetView: clearNeighborhood,
    selectNode: setSelectedId,
  }));

  const visible = useMemo(() => {
    if (!neighborhoodId) return { nodes, links };
    const neighbors = new Set([neighborhoodId]);
    for (const link of links) {
      if (link.source === neighborhoodId) neighbors.add(link.target);
      if (link.target === neighborhoodId) neighbors.add(link.source);
    }
    const kept = nodes.filter((node) => neighbors.has(node.id));
    const keptIds = new Set(kept.map((node) => node.id));
    const keptLinks = links.filter((link) => keptIds.has(link.source) && keptIds.has(link.target));
    return { nodes: kept, links: keptLinks };
  }, [nodes, links, neighborhoodId]);

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
    const callers: GraphCanvasNode[] = [];
    const callees: GraphCanvasNode[] = [];
    const importedBy: GraphCanvasNode[] = [];
    const importsOut: GraphCanvasNode[] = [];
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
        (node): node is GraphCanvasNode =>
          !!node &&
          (node.file.toLowerCase().includes("test") || node.label.toLowerCase().startsWith("test"))
      );
    return { callers, callees, importedBy, imports: importsOut, tests };
  }, [selected, links, nodesById]);

  function nodeSummaryMarkdown(node: GraphCanvasNode): string {
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

  async function copySummary(node: GraphCanvasNode) {
    await navigator.clipboard.writeText(nodeSummaryMarkdown(node));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  function focusNode(node: GraphCanvasNode) {
    onFocusNode?.(node);
    setFocusSet(true);
    window.setTimeout(() => setFocusSet(false), 1500);
  }

  return (
    <div className="flex gap-4">
      <div
        ref={containerRef}
        className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]"
      >
        {neighborhoodId && (
          <button
            type="button"
            onClick={clearNeighborhood}
            className="absolute left-3 top-3 z-10 rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-neutral-200 backdrop-blur hover:bg-black/60"
          >
            ◀ Full graph
          </button>
        )}
        <ForceGraph2D
          ref={graphRef}
          width={plotWidth}
          height={height}
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
            ctx.fillStyle = nodeColor(n.kind);
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
          linkColor={(link) => `${EDGE_COLORS[edgeGroup((link as SimLink).relation)]}66`}
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
          <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">Selected</div>
          <div className="mt-1 break-words text-base font-semibold text-neutral-100">{selected.label}</div>
          <dl className="mt-3 space-y-1 text-xs text-neutral-400">
            <Row label="File" value={selected.file + (selected.line ? `:${selected.line}` : "")} />
            <Row label="Type" value={selected.kind} />
            <Row
              label="Degree"
              value={`${degree(selected)} connections (${selected.inDegree} in / ${selected.outDegree} out)`}
            />
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
                ⚡ Low connectivity: a leaf function. Consider claude-haiku-4-5 for edits here.
              </p>
            ) : degree(selected) > 20 ? (
              <p className="mt-1 text-neutral-400">
                ⚠️ {degree(selected)} connections. Changes ripple widely. Write a test first.
              </p>
            ) : (
              <p className="mt-1 text-neutral-400">{degree(selected)} connections, moderate impact.</p>
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
            {onFocusNode && (
              <button
                type="button"
                onClick={() => focusNode(selected)}
                className="flex-1 rounded-md border border-[#5b8def]/30 bg-[#5b8def]/10 px-2 py-1.5 text-xs text-[#9cc0ff] hover:bg-[#5b8def]/20"
              >
                {focusSet ? "Focus set ✓" : "Set as focus"}
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
});

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
  nodes: GraphCanvasNode[];
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
        {nodes.length > 8 && <li className="text-neutral-600">+{nodes.length - 8} more</li>}
      </ul>
    </div>
  );
}

/** Compact legend for the color encoding above — used by the embed bundle; the dashboard page keeps its own inline legend alongside its extra filter controls. */
export function GraphLegend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-400">
      {(["file", "function", "class"] as const).map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: nodeColor(kind) }} />
          {kind}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: CRITICAL_RING }} />
        critical path
      </span>
      <span className="mx-1 text-neutral-700">|</span>
      {(Object.keys(EDGE_COLORS) as EdgeGroup[]).map((group) => (
        <span key={group} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ backgroundColor: EDGE_COLORS[group] }} />
          {group}
        </span>
      ))}
    </div>
  );
}
