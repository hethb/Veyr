// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import SwiftUI

/// Hosts the Veyr Spend dashboard in a standalone window. One window per app,
/// shown/raised from the menu action.
@MainActor
final class VeyrSpendWindowController {
    static let shared = VeyrSpendWindowController()

    private var window: NSWindow?

    private init() {}

    func show(filterTag: String? = nil) {
        if let filterTag {
            VeyrSpend.shared.dashboardFilterTag = filterTag
            VeyrSpend.shared.dashboardSelectedTab = 0
        }
        if let window = self.window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let hosting = NSHostingController(rootView: VeyrDashboardRootView(
            store: VeyrSpend.shared,
            agentService: VeyrAgentStatusService.shared))
        let window = NSWindow(contentViewController: hosting)
        window.title = "Veyr"
        window.setContentSize(NSSize(width: 760, height: 720))
        window.styleMask = [.titled, .closable, .miniaturizable, .resizable]
        window.isReleasedWhenClosed = false
        window.center()
        window.setFrameAutosaveName("veyr-spend-dashboard")
        self.window = window

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        Task { await VeyrSpend.shared.refresh() }
    }
}

extension StatusItemController {
    @objc func showVeyrSpendDashboard(_ sender: NSMenuItem) {
        VeyrSpendWindowController.shared.show(filterTag: sender.representedObject as? String)
    }
}
