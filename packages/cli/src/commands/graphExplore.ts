// `veyr graph explore` — interactive drill-down over the same Graphify graph
// `veyr graph` summarizes: pick a node, see its callers/callees/imports/tests,
// follow one into the next node, or back up. A terminal translation of the
// dashboard's click -> inspect -> follow-a-relation -> repeat loop (see
// packages/dashboard/src/components/GraphCanvas.tsx) — arrow-key selection
// stands in for clicking, since a terminal can't do pan/zoom.

import * as clack from "@clack/prompts";
import chalk from "chalk";
import { readGraphCache, topNodesByConnections, type GraphCachePayload, type GraphNode } from "@veyr/core";
import { relationsFor, type NodeRelations } from "@veyr/core";
import { fmtAge } from "../ui.js";

const TOP_N = 20;
const RELATION_LIMIT = 8;

const QUIT = Symbol("quit");
const BACK = Symbol("back");
type Choice = string | typeof QUIT | typeof BACK;

export async function graphExploreCommand(): Promise<void> {
  const result = await readGraphCache();
  if (result.kind === "missing") {
    console.log(chalk.dim("○ no graph yet — run `veyr graph --refresh` in your project to build one"));
    return;
  }
  const { payload, generatedAt } = result;

  clack.intro(chalk.bold(payload.workspaceRoot));
  console.log(
    chalk.dim(
      `${payload.isPartial ? "Partial graph" : "Full graph"} · ${payload.fileCount} files · ` +
        `${payload.totalNodeCount} symbols · ${payload.totalLinkCount} links · ${fmtAge(generatedAt)}`
    )
  );

  const byId = new Map(payload.nodes.map((node) => [node.id, node]));
  const stack: string[] = [];

  for (;;) {
    const currentId = stack.at(-1);
    const current = currentId ? byId.get(currentId) : undefined;
    const choice = current
      ? await promptRelations(payload, current, stack.length > 1)
      : await promptTopNodes(payload);

    // Both prompt helpers already normalize a clack cancel (Esc/Ctrl-C) to QUIT.
    if (choice === QUIT) break;
    if (choice === BACK) {
      stack.pop();
      continue;
    }
    stack.push(choice);
  }

  clack.outro("Done.");
}

async function promptTopNodes(payload: GraphCachePayload): Promise<Choice> {
  const top = topNodesByConnections(payload, TOP_N);
  if (top.length === 0) {
    console.log(chalk.dim("No nodes in this graph."));
    return QUIT;
  }
  const choice = await clack.select<Choice>({
    message: "Select a node to inspect",
    options: [
      ...top.map((node) => ({
        value: node.id,
        label: node.label,
        hint: `${node.file} · ${node.connections} conn.`,
      })),
      { value: QUIT, label: "Quit" },
    ],
  });
  return clack.isCancel(choice) ? QUIT : choice;
}

async function promptRelations(payload: GraphCachePayload, node: GraphNode, canGoBack: boolean): Promise<Choice> {
  const relations = relationsFor(payload, node.id);
  const connections = node.inDegree + node.outDegree;
  clack.note(
    [
      `${node.file}${node.line ? `:${node.line}` : ""}`,
      `${node.kind} · ${connections} connections (${node.inDegree} in / ${node.outDegree} out)`,
    ].join("\n"),
    node.label
  );

  const options = [
    ...relationOptions("Called by", relations.callers),
    ...relationOptions("Calls", relations.callees),
    ...relationOptions("Imported by", relations.importedBy),
    ...relationOptions("Imports", relations.imports),
    ...relationOptions("Test", relations.tests),
  ];

  if (options.length === 0) {
    console.log(chalk.dim("No callers, callees, imports, or tests found for this node."));
  }

  const choice = await clack.select<Choice>({
    message: "Follow a connection, or:",
    options: [
      ...options,
      { value: BACK, label: canGoBack ? "← Back" : "← Top nodes" },
      { value: QUIT, label: "Quit" },
    ],
  });
  return clack.isCancel(choice) ? QUIT : choice;
}

function relationOptions(title: string, nodes: NodeRelations[keyof NodeRelations]) {
  return nodes.slice(0, RELATION_LIMIT).map((node) => ({
    value: node.id,
    label: `${title}: ${node.label}`,
    hint: node.file,
  }));
}
