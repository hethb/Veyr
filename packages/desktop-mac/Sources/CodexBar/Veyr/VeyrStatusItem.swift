// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import Foundation
import VeyrKit

/// Veyr's own menu bar item: today's spend (`$0.84`), with a pulsing dot while
/// a Claude Code session is active (any watched JSONL modified in the last 60s).
///
/// A separate status item — rather than a suffix on CodexBar's provider items —
/// because the provider icon pipeline caches renders by signature and clears
/// titles in meter mode; a dedicated item is the app's native pattern anyway
/// (one item per provider). Clicking it opens the Spend dashboard.
@MainActor
final class VeyrStatusItem {
    static let shared = VeyrStatusItem()

    static let showSpendDefaultsKey = "veyrShowSpendInMenuBar"

    private var statusItem: NSStatusItem?
    private var refreshTimer: Timer?
    private var pulseTimer: Timer?
    private var pulsePhaseVisible = true

    private init() {}

    var isEnabled: Bool {
        UserDefaults.standard.object(forKey: Self.showSpendDefaultsKey) as? Bool ?? true
    }

    func activate() {
        guard self.isEnabled else { return }
        guard self.statusItem == nil else { return }

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.autosaveName = "veyr-spend"
        item.behavior = []
        if let button = item.button {
            button.target = self
            button.action = #selector(self.openDashboard)
            button.setAccessibilityTitle("Veyr spend")
            button.font = NSFont.monospacedDigitSystemFont(
                ofSize: NSFont.systemFontSize(for: .small), weight: .medium)
        }
        self.statusItem = item

        self.refreshTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { _ in
            MainActor.assumeIsolated { VeyrStatusItem.shared.render() }
        }
        self.render()
    }

    func deactivate() {
        self.refreshTimer?.invalidate()
        self.refreshTimer = nil
        self.stopPulse()
        if let item = self.statusItem {
            NSStatusBar.system.removeStatusItem(item)
        }
        self.statusItem = nil
    }

    /// Re-reads the enabled preference (Settings toggle calls this).
    func applyEnabledPreference() {
        if self.isEnabled {
            self.activate()
        } else {
            self.deactivate()
        }
    }

    @objc private func openDashboard() {
        VeyrSpendWindowController.shared.show()
    }

    // MARK: - Rendering

    private func render() {
        guard let button = self.statusItem?.button else { return }
        let store = VeyrSpend.shared
        let costText = VeyrFormat.usd(store.todaySpend.costUSD)
        let active = store.isSessionActive

        if active {
            self.startPulseIfNeeded()
        } else {
            self.stopPulse()
        }

        button.attributedTitle = Self.title(
            costText: costText,
            active: active,
            dotVisible: self.pulsePhaseVisible,
            font: button.font)
    }

    static func title(
        costText: String,
        active: Bool,
        dotVisible: Bool,
        font: NSFont?) -> NSAttributedString
    {
        let title = NSMutableAttributedString()
        let baseFont = font ?? NSFont.menuBarFont(ofSize: 0)
        if active {
            let dotColor = NSColor.systemGreen.withAlphaComponent(dotVisible ? 1.0 : 0.25)
            title.append(NSAttributedString(string: "● ", attributes: [
                .foregroundColor: dotColor,
                .font: baseFont,
            ]))
        }
        title.append(NSAttributedString(string: costText, attributes: [
            .font: baseFont,
        ]))
        return title
    }

    // MARK: - Pulse (dot opacity toggles every 0.5s while a session is active)

    private func startPulseIfNeeded() {
        guard self.pulseTimer == nil else { return }
        self.pulseTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { _ in
            MainActor.assumeIsolated {
                let item = VeyrStatusItem.shared
                item.pulsePhaseVisible.toggle()
                item.render()
            }
        }
    }

    private func stopPulse() {
        self.pulseTimer?.invalidate()
        self.pulseTimer = nil
        self.pulsePhaseVisible = true
    }
}
