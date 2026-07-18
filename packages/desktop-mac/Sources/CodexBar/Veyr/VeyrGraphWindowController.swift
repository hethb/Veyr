// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import SwiftUI

/// Hosts the codebase graph in a standalone window. One window per app,
/// shown/raised from the Agent tab's "View graph" button — mirrors
/// VeyrSpendWindowController's shape.
@MainActor
final class VeyrGraphWindowController {
    static let shared = VeyrGraphWindowController()

    private var window: NSWindow?

    private init() {}

    func show() {
        if let window = self.window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let hosting = NSHostingController(rootView: VeyrGraphContainerView(service: VeyrGraphService.shared))
        let window = NSWindow(contentViewController: hosting)
        window.title = "Veyr — Codebase Graph"
        window.setContentSize(NSSize(width: 900, height: 700))
        window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
        window.isReleasedWhenClosed = false
        window.center()
        window.setFrameAutosaveName("veyr-graph-window")
        self.window = window

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

/// Thin SwiftUI root so the window controller doesn't need to know about
/// VeyrGraphWebView directly — just re-renders (and re-posts fresh JSON into
/// the webview) whenever VeyrGraphService's observed currentGraph changes.
private struct VeyrGraphContainerView: View {
    let service: VeyrGraphService

    var body: some View {
        VeyrGraphWebView(graph: self.service.currentGraph)
            .frame(minWidth: 700, minHeight: 500)
    }
}
