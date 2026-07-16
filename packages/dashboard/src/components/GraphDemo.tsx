// A real, interactive react-force-graph-2d instance — same rendering code
// and color grammar as the actual product's graph view (src/pages/Graph.tsx)
// — fed with a fixed sample dataset instead of a live local proxy, since a
// marketing-page visitor has no repo for Veyr to read yet. Drag, zoom, and
// click all work; `veyr graph` on a real repo produces the live version.
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

interface DemoNode {
  id: string;
  label: string;
  kind: "file" | "function" | "class";
  file: string;
  inDegree: number;
  outDegree: number;
}

interface DemoLink {
  source: string;
  target: string;
  relation: "calls" | "imports" | "inherits" | "structure";
}

const NODE_COLORS: Record<DemoNode["kind"], string> = {
  file: "#2563EB",
  function: "#16A34A",
  class: "#7C3AED",
};

const EDGE_COLORS: Record<DemoLink["relation"], string> = {
  calls: "#EA580C",
  imports: "#3B82F6",
  inherits: "#DB2777",
  structure: "#0D9488",
};

const CRITICAL_RING = "#EAB308";
const SURFACE = "#0a0b10";

const NODES: DemoNode[] = [
  { id: "tokenStore", label: "TokenStore", kind: "class", file: "auth/tokenStore.ts", inDegree: 3, outDegree: 2 },
  { id: "refreshToken", label: "refreshToken()", kind: "function", file: "auth/tokenStore.ts", inDegree: 4, outDegree: 3 },
  { id: "validateToken", label: "validateToken()", kind: "function", file: "auth/tokenStore.ts", inDegree: 3, outDegree: 1 },
  { id: "login", label: "login()", kind: "function", file: "auth/session.ts", inDegree: 2, outDegree: 2 },
  { id: "logout", label: "logout()", kind: "function", file: "auth/session.ts", inDegree: 1, outDegree: 1 },
  { id: "sessionManager", label: "SessionManager", kind: "class", file: "auth/session.ts", inDegree: 2, outDegree: 3 },
  { id: "apiClient", label: "apiClient.ts", kind: "file", file: "api/apiClient.ts", inDegree: 1, outDegree: 2 },
  { id: "authMiddleware", label: "authMiddleware()", kind: "function", file: "api/middleware.ts", inDegree: 1, outDegree: 1 },
  { id: "useAuth", label: "useAuth()", kind: "function", file: "hooks/useAuth.ts", inDegree: 0, outDegree: 2 },
  { id: "loginForm", label: "LoginForm", kind: "class", file: "components/LoginForm.tsx", inDegree: 0, outDegree: 1 },
  { id: "sessionTest", label: "session.test.ts", kind: "file", file: "auth/session.test.ts", inDegree: 0, outDegree: 1 },
  { id: "encryptor", label: "Encryptor", kind: "class", file: "auth/encryptor.ts", inDegree: 1, outDegree: 0 },
];

const LINKS: DemoLink[] = [
  { source: "refreshToken", target: "tokenStore", relation: "calls" },
  { source: "validateToken", target: "tokenStore", relation: "calls" },
  { source: "login", target: "tokenStore", relation: "calls" },
  { source: "login", target: "sessionManager", relation: "calls" },
  { source: "logout", target: "sessionManager", relation: "calls" },
  { source: "sessionManager", target: "refreshToken", relation: "calls" },
  { source: "sessionManager", target: "validateToken", relation: "calls" },
  { source: "authMiddleware", target: "validateToken", relation: "calls" },
  { source: "apiClient", target: "authMiddleware", relation: "imports" },
  { source: "useAuth", target: "login", relation: "calls" },
  { source: "useAuth", target: "logout", relation: "calls" },
  { source: "loginForm", target: "useAuth", relation: "imports" },
  { source: "tokenStore", target: "encryptor", relation: "calls" },
  { source: "sessionTest", target: "sessionManager", relation: "imports" },
];

function degree(node: DemoNode): number {
  return node.inDegree + node.outDegree;
}

interface SimNode extends DemoNode {
  x?: number;
  y?: number;
}

export function GraphDemo() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [width, setWidth] = useState(600);
  const [selectedId, setSelectedId] = useState<string | null>("tokenStore");

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.offsetWidth));
    observer.observe(element);
    setWidth(element.offsetWidth);
    return () => observer.disconnect();
  }, []);

  const criticalIds = useMemo(() => {
    const sorted = [...NODES].sort((a, b) => degree(b) - degree(a));
    return new Set(sorted.slice(0, 3).map((n) => n.id));
  }, []);

  const graphData = useMemo(
    () => ({
      nodes: NODES.map((n): SimNode => ({ ...n })),
      links: LINKS.map((l) => ({ ...l })),
    }),
    [],
  );

  const nodesById = useMemo(() => new Map(NODES.map((n) => [n.id, n])), []);
  const selected = selectedId ? (nodesById.get(selectedId) ?? null) : null;
  const relations = useMemo(() => {
    if (!selected) return null;
    const callers: DemoNode[] = [];
    const callees: DemoNode[] = [];
    for (const link of LINKS) {
      if (link.relation !== "calls" && link.relation !== "imports") continue;
      if (link.target === selected.id) {
        const n = nodesById.get(link.source);
        if (n) callers.push(n);
      } else if (link.source === selected.id) {
        const n = nodesById.get(link.target);
        if (n) callees.push(n);
      }
    }
    return { callers, callees };
  }, [selected, nodesById]);

  return (
    <div className="border border-white/[0.07] bg-white/[0.015]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.07] px-4 py-2.5 text-xs text-neutral-500">
        <span>Sample repo — drag nodes, scroll to zoom, click to inspect</span>
        <span className="text-neutral-600">12 nodes · 14 edges (yours will differ)</span>
      </div>
      <div className="flex flex-col md:flex-row">
        <div ref={containerRef} className="min-w-0 flex-1">
          <ForceGraph2D
            ref={graphRef}
            width={width}
            height={380}
            backgroundColor={SURFACE}
            graphData={graphData}
            nodeId="id"
            nodeLabel={(node) => {
              const n = node as SimNode;
              return `${n.label} · ${n.kind} · ${degree(n)} connections<br/>${n.file}`;
            }}
            nodeVal={(node) => Math.max(1, Math.sqrt(degree(node as SimNode)))}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const n = node as SimNode;
              if (n.x === undefined || n.y === undefined) return;
              const radius = Math.max(3, Math.sqrt(degree(n)) * 1.6);
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
              ctx.fillStyle = NODE_COLORS[n.kind];
              ctx.fill();
              if (n.id === selectedId) {
                ctx.lineWidth = 2 / globalScale;
                ctx.strokeStyle = "#f1f3f7";
                ctx.stroke();
              }
              if (globalScale > 0.85 || n.id === selectedId || criticalIds.has(n.id)) {
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
              ctx.beginPath();
              ctx.arc(n.x, n.y, Math.max(8, Math.sqrt(degree(n)) * 1.6 + 4), 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
            }}
            linkColor={(link) => `${EDGE_COLORS[(link as unknown as DemoLink).relation]}66`}
            linkWidth={1}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowRelPos={1}
            onNodeClick={(node) => setSelectedId((node as SimNode).id)}
            onBackgroundClick={() => setSelectedId(null)}
            cooldownTicks={100}
          />
        </div>

        {selected && relations && (
          <aside className="w-full shrink-0 border-t border-white/[0.07] p-4 text-sm md:w-64 md:border-l md:border-t-0">
            <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
              Selected
            </div>
            <div className="mt-1 text-base font-semibold text-neutral-100">{selected.label}</div>
            <div className="mt-1 text-xs text-neutral-500">{selected.file}</div>
            <div className="mt-2 text-xs text-neutral-400">
              {degree(selected)} connections ({selected.inDegree} in / {selected.outDegree} out)
            </div>
            {relations.callers.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Called by
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-neutral-300">
                  {relations.callers.map((n) => (
                    <li key={n.id}>{n.label}</li>
                  ))}
                </ul>
              </div>
            )}
            {relations.callees.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                  Calls
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-neutral-300">
                  {relations.callees.map((n) => (
                    <li key={n.id}>{n.label}</li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
