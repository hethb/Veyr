// Host-agnostic messaging shim for the embeddable graph bundle. The same
// built HTML file is loaded by three different hosts — the dashboard's own
// preview, the VS Code webview panel, and the Mac app's WKWebView window —
// and none of graph-rendering code (GraphCanvas) should need to know which.
//
// Inbound (host -> page): every host delivers graph data the same way, a
// `window.postMessage({type:"graphData", payload}, ...)` into this page's own
// window — VS Code's `webview.postMessage()` does this natively, and the Mac
// app's WKWebView triggers the identical path by evaluating
// `window.postMessage(...)` as injected JS. One listener covers all hosts.
//
// Outbound (page -> host) has no such shared primitive, so `post()` picks
// whichever channel the current host exposes.

export interface OutboundMessage {
  readonly type: "nodeSelected" | "focusNode";
  readonly [key: string]: unknown;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
    webkit?: { messageHandlers?: { veyr?: { postMessage(message: unknown): void } } };
  }
}

let vsCodeApi: VsCodeApi | null | undefined;

// `acquireVsCodeApi()` throws if called more than once per webview load, so
// the result is cached for the life of the page.
function getVsCodeApi(): VsCodeApi | null {
  if (vsCodeApi !== undefined) return vsCodeApi;
  vsCodeApi = typeof window.acquireVsCodeApi === "function" ? window.acquireVsCodeApi() : null;
  return vsCodeApi;
}

/** Sends a message out to whichever host embedded this page. */
export function post(message: OutboundMessage): void {
  const vscode = getVsCodeApi();
  if (vscode) {
    vscode.postMessage(message);
    return;
  }
  const veyrHandler = window.webkit?.messageHandlers?.veyr;
  if (veyrHandler) {
    veyrHandler.postMessage(message);
    return;
  }
  // Plain browser preview (opening the built file directly, or a dashboard-hosted iframe): best effort.
  window.parent.postMessage(message, "*");
}

export interface EmbedGraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly file: string;
  readonly line?: number | null;
  readonly community?: number | null;
  readonly inDegree: number;
  readonly outDegree: number;
}

export interface EmbedGraphLink {
  readonly source: string;
  readonly target: string;
  readonly relation: string;
}

export interface EmbedGraphPayload {
  readonly nodes: readonly EmbedGraphNode[];
  readonly links: readonly EmbedGraphLink[];
  readonly workspaceRoot?: string;
}

/** Listens for the host pushing graph data in. Returns an unsubscribe function. */
export function onGraphData(handler: (payload: EmbedGraphPayload) => void): () => void {
  const listener = (event: MessageEvent) => {
    const data = event.data as { type?: string; payload?: EmbedGraphPayload } | undefined;
    if (data?.type === "graphData" && data.payload) handler(data.payload);
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}
