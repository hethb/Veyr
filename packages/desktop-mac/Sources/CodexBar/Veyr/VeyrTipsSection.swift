// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import CodexBarCore
import SwiftUI

/// "Tips" — suggestion-engine cards below the session timeline in the Spend tab.
/// Shows up to 3 non-dismissed suggestions; "Show all tips" reveals dismissed
/// ones with a restore action. Dismissals persist to ~/.veyr/dismissed-suggestions.json.
struct VeyrTipsSection: View {
    @Bindable var service: VeyrAgentStatusService
    @Bindable var store: VeyrSpendStore

    @State private var showAll = false
    @State private var copiedLabel: String?

    private static let cachingDocsURL = "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching"
    private static let outputConstraintHint =
        "Keep responses concise. Prefer diffs and file references over reprinting whole files. " +
            "Do not restate unchanged code."
    private static let contextFileTemplate = """
    # VEYR_CONTEXT.md — session handoff
    ## What this project is
    <one paragraph>
    ## Current state
    <what works, what doesn't>
    ## Active task
    <the thing being worked on right now>
    ## Conventions
    <build commands, test commands, style notes>
    """

    var body: some View {
        let visible = self.visibleSuggestions
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Tips")
                    .font(.headline)
                Spacer()
                if self.hasDismissed {
                    Button(self.showAll ? "Hide dismissed" : "Show all tips") {
                        self.showAll.toggle()
                    }
                    .buttonStyle(.link)
                    .font(.caption)
                }
            }
            if visible.isEmpty {
                Text("No optimization tips right now — spend profile looks healthy.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(visible) { suggestion in
                self.tipCard(suggestion)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private var hasDismissed: Bool {
        self.service.latestSuggestions.contains {
            self.service.dismissedSuggestionIDs.contains($0.id)
        }
    }

    private var visibleSuggestions: [Suggestion] {
        let all = self.service.latestSuggestions
        if self.showAll { return all }
        return Array(all.filter { !self.service.dismissedSuggestionIDs.contains($0.id) }.prefix(3))
    }

    private func tipCard(_ suggestion: Suggestion) -> some View {
        let dismissed = self.service.dismissedSuggestionIDs.contains(suggestion.id)
        return HStack(alignment: .top, spacing: 10) {
            VStack(spacing: 4) {
                Text(suggestion.severity.rawValue.uppercased())
                    .font(.caption2.weight(.bold))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(self.severityColor(suggestion.severity).opacity(0.2), in: Capsule())
                    .foregroundStyle(self.severityColor(suggestion.severity))
                if suggestion.isQuickWin {
                    Text("QUICK WIN")
                        .font(.system(size: 8, weight: .bold))
                        .padding(.horizontal, 4)
                        .padding(.vertical, 1)
                        .background(.green.opacity(0.2), in: Capsule())
                        .foregroundStyle(.green)
                }
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(suggestion.title)
                    .font(.callout.weight(.medium))
                Text(suggestion.detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if suggestion.estimatedMonthlySavingsUSD > 0 {
                    Text("Saves ~\(VeyrFormat.usd(suggestion.estimatedMonthlySavingsUSD))/mo")
                        .font(.caption)
                        .foregroundStyle(.green)
                } else if suggestion.estimatedHourlySavingsUSD > 0 {
                    Text("Saves ~\(VeyrFormat.usd(suggestion.estimatedHourlySavingsUSD))/hr")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
                HStack(spacing: 10) {
                    Button(self.copiedLabel == suggestion.id ? "Done ✓" : suggestion.actionLabel) {
                        self.performAction(suggestion)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    if dismissed {
                        Button("Restore") {
                            self.service.restoreSuggestion(id: suggestion.id)
                        }
                        .buttonStyle(.plain)
                        .controlSize(.small)
                        .foregroundStyle(.secondary)
                    } else {
                        Button("✕ Dismiss") {
                            self.service.dismissSuggestion(id: suggestion.id)
                        }
                        .buttonStyle(.plain)
                        .controlSize(.small)
                        .foregroundStyle(.secondary)
                    }
                }
            }
            Spacer()
        }
        .padding(10)
        .opacity(dismissed ? 0.55 : 1)
        .background(.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
    }

    private func severityColor(_ severity: SuggestionSeverity) -> Color {
        switch severity {
        case .high: .red
        case .medium: .orange
        case .low: .secondary
        }
    }

    private func performAction(_ suggestion: Suggestion) {
        switch suggestion.action {
        case .switchModel:
            self.copy("/model \(suggestion.suggestedModel ?? "")", id: suggestion.id)
        case .compactContext:
            self.copy("/compact", id: suggestion.id)
        case .addOutputConstraints:
            self.copy(Self.outputConstraintHint, id: suggestion.id)
        case .useContextFile:
            self.copy(Self.contextFileTemplate, id: suggestion.id)
        case .setBudgetCap:
            self.store.dashboardSelectedTab = 2
        case .enableCaching:
            if let url = URL(string: Self.cachingDocsURL) {
                NSWorkspace.shared.open(url)
            }
        }
    }

    private func copy(_ text: String, id: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        self.copiedLabel = id
        Task {
            try? await Task.sleep(for: .seconds(2))
            if self.copiedLabel == id { self.copiedLabel = nil }
        }
    }
}
