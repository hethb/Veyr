// Ports the dashboard's relation-grouping (packages/dashboard/src/components/
// GraphCanvas.tsx's edgeGroup/selectedRelations) to the CLI's GraphCachePayload
// shape, so `veyr graph explore`'s drill-down shows the same callers/callees/
// imports/imported-by/tests grouping the dashboard's and embedded webviews'
// click-to-inspect detail panel already shows.

import type { GraphCachePayload, GraphNode } from "./graph.js";

export type EdgeGroup = "calls" | "imports" | "inherits" | "structure";

export function edgeGroup(relation: string): EdgeGroup {
  if (relation === "calls" || relation === "indirect_call") return "calls";
  if (relation === "imports" || relation === "imports_from") return "imports";
  if (relation === "inherits" || relation === "implements") return "inherits";
  return "structure";
}

export interface NodeRelations {
  readonly callers: readonly GraphNode[];
  readonly callees: readonly GraphNode[];
  readonly importedBy: readonly GraphNode[];
  readonly imports: readonly GraphNode[];
  readonly tests: readonly GraphNode[];
}

function looksLikeTest(node: GraphNode): boolean {
  return node.file.toLowerCase().includes("test") || node.label.toLowerCase().startsWith("test");
}

/** Callers/callees/imports/imported-by/tests for one node — the same grouping the dashboard's detail panel shows. */
export function relationsFor(payload: GraphCachePayload, nodeId: string): NodeRelations {
  const byId = new Map(payload.nodes.map((node) => [node.id, node]));
  const callers: GraphNode[] = [];
  const callees: GraphNode[] = [];
  const importedBy: GraphNode[] = [];
  const imports: GraphNode[] = [];
  const neighborIds = new Set<string>();

  for (const link of payload.links) {
    const group = edgeGroup(link.relation);
    if (group !== "calls" && group !== "imports") continue;
    if (link.target === nodeId) {
      const node = byId.get(link.source);
      if (!node) continue;
      neighborIds.add(node.id);
      (group === "calls" ? callers : importedBy).push(node);
    } else if (link.source === nodeId) {
      const node = byId.get(link.target);
      if (!node) continue;
      neighborIds.add(node.id);
      (group === "calls" ? callees : imports).push(node);
    }
  }

  const tests = [...neighborIds]
    .map((id) => byId.get(id))
    .filter((node): node is GraphNode => !!node && looksLikeTest(node));

  return { callers, callees, importedBy, imports, tests };
}
