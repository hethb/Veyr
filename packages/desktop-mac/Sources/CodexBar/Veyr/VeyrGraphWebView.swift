// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import SwiftUI
import VeyrKit
@preconcurrency import WebKit

/// Hosts the same graph embed bundle the VS Code extension's webview panel
/// loads (packages/dashboard/src/embed, checked into
/// Resources/graph-embed/index.html by Scripts/update-graph-embed.sh) — one
/// rendering implementation, reused here rather than re-implemented as a
/// native SwiftUI Canvas. Feeds it the current CodebaseGraph as JSON and
/// receives "focusNode" clicks back through a WKScriptMessageHandler.
struct VeyrGraphWebView: NSViewRepresentable {
    let graph: CodebaseGraph?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "veyr")
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        context.coordinator.webView = webView
        if let url = Self.resourceBundle?.url(forResource: "index", withExtension: "html", subdirectory: "graph-embed") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.send(graph: self.graph)
    }

    /// Mirrors ProviderBrandIcon's resource lookup: `Bundle.module` in
    /// `swift run`/tests, the packaged app's `CodexBar_CodexBar.bundle` once
    /// distributed.
    private static let resourceBundle: Bundle? = {
        guard Bundle.main.bundleURL.pathExtension == "app" else {
            return Bundle.module
        }
        if let bundleURL = Bundle.main.url(forResource: "CodexBar_CodexBar", withExtension: "bundle"),
           let bundle = Bundle(url: bundleURL)
        {
            return bundle
        }
        return Bundle.main
    }()

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        private var pendingGraph: CodebaseGraph?
        private var didFinishLoad = false

        func send(graph: CodebaseGraph?) {
            self.pendingGraph = graph
            if self.didFinishLoad { self.postGraphData() }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            self.didFinishLoad = true
            self.postGraphData()
        }

        private func postGraphData() {
            guard let webView, let graph = self.pendingGraph else { return }
            let payload = GraphifyRunner.cachePayload(for: graph)
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            guard let data = try? encoder.encode(payload), let json = String(data: data, encoding: .utf8) else { return }
            // window.postMessage dispatches a real `message` event inside the
            // page — the identical inbound path VS Code's webview.postMessage
            // uses, so bridge.ts needs exactly one listener for both hosts.
            webView.evaluateJavaScript("window.postMessage({type:'graphData',payload:\(json)}, '*');")
        }

        nonisolated func userContentController(
            _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
        ) {
            Task { @MainActor in
                guard let body = message.body as? [String: Any],
                      body["type"] as? String == "focusNode",
                      let file = body["file"] as? String
                else { return }
                Self.writeFocusOverride(file: file, line: body["line"] as? Int)
            }
        }

        /// Writes the same ~/.veyr/graph-focus.json the dashboard's "Set as
        /// focus" button writes (via the proxy) — VeyrGraphService already
        /// reads it back out through `focusOverride(now:)`, and this window
        /// is in the same process, so no HTTP round-trip is needed.
        private static func writeFocusOverride(file: String, line: Int?) {
            let override = VeyrGraphService.FocusOverride(file: file, line: line, setAt: Date())
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            guard let data = try? encoder.encode(override) else { return }
            try? data.write(to: VeyrPaths.graphFocusFile())
        }
    }
}
