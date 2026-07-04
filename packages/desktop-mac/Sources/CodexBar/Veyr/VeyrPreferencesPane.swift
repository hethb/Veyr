// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import CodexBarCore
import SwiftUI

/// The "Veyr" tab in Settings: data retention, feature-tag overrides, toggles,
/// the agent feed path, and session-history clearing.
@MainActor
struct VeyrPreferencesPane: View {
    @Bindable var store: UsageStore

    @State private var retentionDays = VeyrSpendStore.retentionDays
    @State private var overrides: [OverrideRow] = []
    @State private var newOverridePath = ""
    @State private var newOverrideTag = ""
    @State private var showClearConfirmation = false
    @State private var clearedFlash = false
    @State private var copiedPath = false

    struct OverrideRow: Identifiable, Equatable {
        let id = UUID()
        var path: String
        var tag: String
    }

    private static let retentionChoices: [(label: String, days: Int)] = [
        ("30 days", 30), ("60 days", 60), ("90 days", 90), ("180 days", 180), ("Unlimited", 0),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                self.retentionSection
                Divider()
                self.overridesSection
                Divider()
                self.togglesSection
                Divider()
                self.agentFeedSection
                Divider()
                self.clearHistorySection
                Divider()
                self.privacyFooter
            }
            .padding(.vertical, 8)
        }
        .onAppear { self.loadState() }
    }

    // MARK: - Data retention

    private var retentionSection: some View {
        PreferenceControlRow(
            title: "Data retention",
            subtitle: "How far back Veyr's spend views and agent feed look. " +
                "Your Claude Code logs themselves are never modified.")
        {
            Picker("", selection: self.$retentionDays) {
                ForEach(Self.retentionChoices, id: \.days) { choice in
                    Text(choice.label).tag(choice.days)
                }
            }
            .labelsHidden()
            .onChange(of: self.retentionDays) { _, newValue in
                VeyrSpendStore.retentionDays = newValue
                Task { await VeyrSpend.shared.refresh() }
            }
        }
    }

    // MARK: - Tag overrides

    private var overridesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Feature tag overrides")
                .font(.body)
            Text("Map a project path to a custom tag. Overrides also cover subdirectories.")
                .font(.footnote)
                .foregroundStyle(.tertiary)

            ForEach(self.$overrides) { $row in
                HStack(spacing: 8) {
                    TextField("/path/to/project", text: $row.path)
                        .textFieldStyle(.roundedBorder)
                        .font(.callout.monospaced())
                    Text("→")
                        .foregroundStyle(.secondary)
                    TextField("tag", text: $row.tag)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 140)
                    Button {
                        self.overrides.removeAll { $0.id == row.id }
                        self.saveOverrides()
                    } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
                .onChange(of: row) { _, _ in self.saveOverrides() }
            }

            HStack(spacing: 8) {
                TextField("/path/to/project", text: self.$newOverridePath)
                    .textFieldStyle(.roundedBorder)
                    .font(.callout.monospaced())
                Text("→")
                    .foregroundStyle(.secondary)
                TextField("tag", text: self.$newOverrideTag)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 140)
                Button {
                    self.addOverride()
                } label: {
                    Image(systemName: "plus.circle")
                }
                .buttonStyle(.plain)
                .disabled(self.newOverridePath.trimmingCharacters(in: .whitespaces).isEmpty ||
                    self.newOverrideTag.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    // MARK: - Toggles

    private var togglesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            PreferenceToggleRow(
                title: "Show spend in menu bar",
                subtitle: "Today's spend as its own status item, with a pulsing dot during active sessions.",
                binding: Binding(
                    get: { VeyrStatusItem.shared.isEnabled },
                    set: { newValue in
                        UserDefaults.standard.set(newValue, forKey: VeyrStatusItem.showSpendDefaultsKey)
                        VeyrStatusItem.shared.applyEnabledPreference()
                    }))
            PreferenceToggleRow(
                title: "Budget notifications",
                subtitle: "Notify at 80% and 100% of any budget cap (once per month per threshold).",
                binding: Binding(
                    get: { VeyrBudgetNotifier.isEnabled },
                    set: {
                        UserDefaults.standard.set(
                            $0, forKey: VeyrBudgetNotifier.notificationsEnabledDefaultsKey)
                    }))
            PreferenceToggleRow(
                title: "Auto-update CLAUDE.md with spend status",
                subtitle: "Appends spend status and optimization tips to your project's CLAUDE.md " +
                    "every 5 minutes, so Claude Code reads them automatically. On by default; " +
                    "shared with the VS Code extension via ~/.veyr/config.json.",
                binding: Binding(
                    get: { VeyrAgentStatusService.shared.autoUpdateClaudeMdEnabled },
                    set: { VeyrAgentStatusService.shared.autoUpdateClaudeMdEnabled = $0 }))
        }
    }

    // MARK: - Agent feed path

    private var agentFeedSection: some View {
        PreferenceControlRow(
            title: "Agent status file",
            subtitle: VeyrAgentStatusWriter.statusFileURL().path)
        {
            Button(self.copiedPath ? "Copied ✓" : "Copy path") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(
                    VeyrAgentStatusWriter.statusFileURL().path, forType: .string)
                self.copiedPath = true
                Task {
                    try? await Task.sleep(for: .seconds(2))
                    self.copiedPath = false
                }
            }
        }
    }

    // MARK: - Clear history

    private var clearHistorySection: some View {
        PreferenceControlRow(
            title: "Clear session history",
            subtitle: "Deletes Veyr's parsed session cache (~/.veyr/cache). Your Claude Code " +
                "logs and CodexBar data are untouched; the cache rebuilds on next scan.")
        {
            Button(self.clearedFlash ? "Cleared ✓" : "Clear…") {
                self.showClearConfirmation = true
            }
            .confirmationDialog(
                "Clear Veyr's session cache?",
                isPresented: self.$showClearConfirmation)
            {
                Button("Clear cache", role: .destructive) {
                    self.clearSessionHistory()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("The cache rebuilds from your Claude Code logs on the next scan.")
            }
        }
    }

    // MARK: - Privacy

    private var privacyFooter: some View {
        Text("Veyr reads local Claude Code and Codex log files. No data leaves your machine.")
            .font(.footnote)
            .foregroundStyle(.secondary)
    }

    // MARK: - State

    private func loadState() {
        self.retentionDays = VeyrSpendStore.retentionDays
        self.overrides = FeatureTagInferrer.loadRawOverrides()
            .sorted { $0.key < $1.key }
            .map { OverrideRow(path: $0.key, tag: $0.value) }
    }

    private func addOverride() {
        let path = self.newOverridePath.trimmingCharacters(in: .whitespaces)
        let tag = self.newOverrideTag.trimmingCharacters(in: .whitespaces)
        guard !path.isEmpty, !tag.isEmpty else { return }
        self.overrides.append(OverrideRow(path: path, tag: tag))
        self.newOverridePath = ""
        self.newOverrideTag = ""
        self.saveOverrides()
    }

    private func saveOverrides() {
        var dict: [String: String] = [:]
        for row in self.overrides {
            let path = row.path.trimmingCharacters(in: .whitespaces)
            let tag = row.tag.trimmingCharacters(in: .whitespaces)
            guard !path.isEmpty, !tag.isEmpty else { continue }
            dict[path] = tag
        }
        try? FeatureTagInferrer.saveRawOverrides(dict)
        Task { await VeyrSpend.shared.refresh() }
    }

    private func clearSessionHistory() {
        self.clearedFlash = true
        Task {
            await VeyrSpend.shared.clearHistory()
            try? await Task.sleep(for: .seconds(2))
            self.clearedFlash = false
        }
    }
}
