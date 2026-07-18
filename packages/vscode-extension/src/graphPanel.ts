// Webview panel rendering the Graphify codebase graph inside VS Code —
// the embedded twin of packages/dashboard/src/pages/Graph.tsx, loading the
// exact same bundle (see scripts/copy-graph-embed.mjs) instead of
// re-implementing the graph view. Reads from the Veyr menu bar app's daemon
// (src/daemonClient.ts) — the same shared graph state the CLI and the Mac
// app itself read, never a separate computation.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { daemonGet } from "./daemonClient";

interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly file: string;
  readonly line?: number;
  readonly community?: number;
  readonly inDegree: number;
  readonly outDegree: number;
}

interface GraphLink {
  readonly source: string;
  readonly target: string;
  readonly relation: string;
}

interface GraphCachePayload {
  readonly workspaceRoot: string;
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
}

const REFRESH_INTERVAL_MS = 15_000;

export class GraphPanel {
  private static current: GraphPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly timer: ReturnType<typeof setInterval>;

  /** Shows the graph panel, creating it on first use and revealing it thereafter (one panel per window). */
  static show(context: vscode.ExtensionContext): void {
    if (GraphPanel.current) {
      GraphPanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "veyr.graph",
      "Veyr: Codebase graph",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    GraphPanel.current = new GraphPanel(panel, context);
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
    this.panel = panel;
    this.panel.webview.html = GraphPanel.loadHtml(context);
    this.panel.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message));
    this.panel.onDidDispose(() => this.dispose());

    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  private static loadHtml(context: vscode.ExtensionContext): string {
    const bundlePath = vscode.Uri.joinPath(context.extensionUri, "media", "graph", "index.html").fsPath;
    try {
      return fs.readFileSync(bundlePath, "utf8");
    } catch {
      return `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;color:#888;">
        Graph bundle missing — run <code>npm run build</code> in packages/vscode-extension.
      </body></html>`;
    }
  }

  /**
   * Prefers the live daemon (freshest — reflects whichever workspace the Mac
   * app is tracking right now) but falls back to the flat
   * ~/.veyr/cache/graph.json the same way packages/cli/src/veyr/graph.ts
   * does — the app not running is a normal, expected state, not an error.
   */
  private async refresh(): Promise<void> {
    const payload = (await daemonGet<GraphCachePayload>("/graph")) ?? GraphPanel.readGraphCacheFile();
    void this.panel.webview.postMessage({
      type: "graphData",
      payload: payload
        ? { nodes: payload.nodes, links: payload.links, workspaceRoot: payload.workspaceRoot }
        : { nodes: [], links: [] },
    });
  }

  private static readGraphCacheFile(): GraphCachePayload | null {
    try {
      const raw = fs.readFileSync(path.join(os.homedir(), ".veyr", "cache", "graph.json"), "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || !Array.isArray((parsed as GraphCachePayload).nodes)) {
        return null;
      }
      return parsed as GraphCachePayload;
    } catch {
      return null;
    }
  }

  private handleMessage(message: unknown): void {
    if (typeof message !== "object" || message === null) return;
    const msg = message as Record<string, unknown>;
    if (msg["type"] === "focusNode" && typeof msg["file"] === "string") {
      void this.openFile(msg["file"], typeof msg["line"] === "number" ? msg["line"] : undefined);
    }
  }

  private async openFile(file: string, line: number | undefined): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const absPath = path.isAbsolute(file)
      ? file
      : workspaceFolder
        ? path.join(workspaceFolder.uri.fsPath, file)
        : file;
    try {
      const doc = await vscode.workspace.openTextDocument(absPath);
      const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      if (typeof line === "number" && line > 0) {
        const position = new vscode.Position(Math.max(0, line - 1), 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      }
    } catch (err) {
      void vscode.window.showWarningMessage(
        `Veyr: couldn't open ${file} (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  private dispose(): void {
    clearInterval(this.timer);
    GraphPanel.current = undefined;
  }
}
