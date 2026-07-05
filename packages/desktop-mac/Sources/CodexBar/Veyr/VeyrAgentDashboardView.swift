// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import AppKit
import CodexBarCore
import SwiftUI

/// The "Agent" tab: what a coding agent sees about its own burn rate, plus
/// human overrides. Mirrors ~/.veyr/agent-status/VEYR_STATUS.json.
struct VeyrAgentDashboardView: View {
    @Bindable var service: VeyrAgentStatusService

    @State private var overrides = VeyrOverrides.load()
    @State private var sessionCapText = ""
    @State private var compactThresholdText = ""
    @State private var copiedCommand: String?
    @State private var claudeMdUpdatedFlash = false

    private static let modelChoices = [
        "claude-fable-5", "claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5",
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if !VeyrComplexityService.shared.classifierEnabled {
                    HStack(spacing: 8) {
                        Image(systemName: "sparkles")
                            .foregroundStyle(.orange)
                        Text("Add your Anthropic API key in Veyr Settings to enable AI-powered optimization.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding(10)
                    .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
                }
                self.currentSessionCard
                self.feedbackSection
                self.recommendationsSection
                self.toolHealthSection
                self.overridePanel
                self.agentFeedFooter
            }
            .padding(20)
        }
        .frame(minWidth: 680, minHeight: 620)
        .background(.background)
        .onAppear {
            self.loadOverrideFields()
            Task { await self.service.tick() }
        }
    }

    // MARK: - Current session card

    private var currentSessionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("Current session")
                    .font(.headline)
                if self.service.latestPayload?.currentSession?.isActive == true {
                    HStack(spacing: 4) {
                        Circle().fill(.green).frame(width: 7, height: 7)
                        Text("Active")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                } else {
                    Text("Idle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            if let session = self.service.latestPayload?.currentSession {
                Grid(alignment: .leading, horizontalSpacing: 24, verticalSpacing: 6) {
                    GridRow {
                        self.metric("Model", session.model)
                        self.metric("Cost", VeyrFormat.usd(session.sessionCostUsd), large: true)
                    }
                    GridRow {
                        self.metric("Project", session.project)
                        self.metric("Burn rate", String(format: "$%.3f / min", session.costPerMinute))
                    }
                    GridRow {
                        self.metric(
                            "Tokens",
                            "\(VeyrFormat.tokens(session.inputTokens))↓  " +
                                "\(VeyrFormat.tokens(session.outputTokens))↑")
                        self.metric(
                            "Cache",
                            "\(Int((session.cacheHitRate * 100).rounded()))% hit rate" +
                                (session.cacheHitRate > 0.3 ? " ⚡" : ""))
                    }
                }
            } else {
                Text("No session found yet — run Claude Code and this fills in.")
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func metric(_ label: String, _ value: String, large: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value)
                .font(large ? .title2.weight(.semibold) : .body)
                .monospacedDigit()
        }
    }

    // MARK: - Session feedback (trains the local model)

    @ViewBuilder
    private var feedbackSection: some View {
        let complexityService = VeyrComplexityService.shared
        if let candidate = complexityService.feedbackCandidate {
            VStack(alignment: .leading, spacing: 8) {
                Text("Last session (\(candidate.featureTag) · \(candidate.model))")
                    .font(.callout.weight(.medium))
                Text("We classified it as: mostly \(candidate.dominantComplexity) tasks " +
                    "(\(candidate.turnCount) turns). Was that right?")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    Button("✓ Yes") {
                        complexityService.submitFeedback(
                            sessionId: candidate.sessionId,
                            complexity: candidate.dominantComplexity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    Button("✗ No — it was complex") {
                        complexityService.submitFeedback(
                            sessionId: candidate.sessionId,
                            complexity: "complex")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
        } else if complexityService.labeledSampleCount >= 100 {
            Text("Your optimization model is training on \(complexityService.labeledSampleCount) " +
                "rated samples. Suggestions will improve over time.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - Recommendations

    private var recommendationsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Recommendations")
                .font(.headline)
            let recommendations = self.service.visibleRecommendations
            if recommendations.isEmpty {
                Text("None right now — spend profile looks healthy.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(recommendations, id: \.id) { rec in
                self.recommendationCard(rec)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func recommendationCard(_ rec: VeyrAgentStatusPayload.Recommendation) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text(rec.priority.uppercased())
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(self.priorityColor(rec.priority).opacity(0.2), in: Capsule())
                .foregroundStyle(self.priorityColor(rec.priority))
            VStack(alignment: .leading, spacing: 4) {
                Text(self.recommendationTitle(rec))
                    .font(.callout.weight(.medium))
                Text(rec.reason)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if rec.estimatedSavingsPerHourUsd > 0 {
                    Text("Saves ~\(VeyrFormat.usd(rec.estimatedSavingsPerHourUsd))/hr")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
                HStack(spacing: 10) {
                    Button(self.copyLabel(for: rec)) {
                        self.copyCommand(for: rec)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    Button("Dismiss") {
                        self.service.dismissRecommendation(id: rec.id)
                    }
                    .buttonStyle(.plain)
                    .controlSize(.small)
                    .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(10)
        .background(.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
    }

    private func recommendationTitle(_ rec: VeyrAgentStatusPayload.Recommendation) -> String {
        switch rec.action {
        case "switch_model": "Switch to \(rec.suggestedModel ?? "a smaller model")"
        case "compact_context": "Run /compact"
        default: rec.action
        }
    }

    private func command(for rec: VeyrAgentStatusPayload.Recommendation) -> String {
        switch rec.action {
        case "switch_model": "/model \(rec.suggestedModel ?? "")"
        case "compact_context": "/compact"
        default: rec.action
        }
    }

    private func copyLabel(for rec: VeyrAgentStatusPayload.Recommendation) -> String {
        let command = self.command(for: rec)
        return self.copiedCommand == command ? "Copied ✓" : "Copy \(command)"
    }

    private func copyCommand(for rec: VeyrAgentStatusPayload.Recommendation) {
        let command = self.command(for: rec)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(command, forType: .string)
        self.copiedCommand = command
        Task {
            try? await Task.sleep(for: .seconds(2))
            if self.copiedCommand == command { self.copiedCommand = nil }
        }
    }

    private func priorityColor(_ priority: String) -> Color {
        switch priority {
        case "high": .red
        case "medium": .orange
        default: .secondary
        }
    }

    // MARK: - Tool health

    @ViewBuilder
    private var toolHealthSection: some View {
        if let quality = self.service.latestPayload?.toolQuality, quality.analyzed {
            VStack(alignment: .leading, spacing: 8) {
                Text("Tool health")
                    .font(.headline)
                if let tools = self.service.latestPayload?.toolAnalysis {
                    Text("\(tools.toolsUsed) of ~\(tools.toolsLoaded) known tools used this session" +
                        (tools.unusedToolTokenEstimate > 0
                            ? " · unused definitions ≈ \(tools.unusedToolTokenEstimate) tokens/turn"
                            : ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if quality.flaggedTools.isEmpty {
                    Text("No vague tool names detected. (Descriptions aren't visible in local " +
                        "logs, so only names are checked.)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(quality.flaggedTools, id: \.name) { tool in
                        HStack(alignment: .top, spacing: 8) {
                            Text(tool.name)
                                .font(.caption.monospaced())
                                .foregroundStyle(.orange)
                            Text("\(tool.issue.replacingOccurrences(of: "_", with: " ")) — \(tool.suggestion)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
        }
    }

    // MARK: - Overrides

    private var overridePanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Overrides")
                .font(.headline)
            Text("Written to VEYR_OVERRIDES.json — agents can read these alongside the status feed.")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                Text("Force model for this session:")
                Picker("", selection: Binding(
                    get: { self.overrides.forceModel ?? "" },
                    set: { self.overrides.forceModel = $0.isEmpty ? nil : $0 }))
                {
                    Text("No override").tag("")
                    ForEach(Self.modelChoices, id: \.self) { model in
                        Text(model).tag(model)
                    }
                }
                .labelsHidden()
                .frame(width: 220)
            }

            HStack {
                Text("Session budget cap:")
                TextField("e.g. 5.00", text: self.$sessionCapText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 90)
                Text("USD")
                    .foregroundStyle(.secondary)
            }

            HStack {
                Text("Auto-compact when context exceeds:")
                TextField("e.g. 100000", text: self.$compactThresholdText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 110)
                Text("tokens")
                    .foregroundStyle(.secondary)
            }

            HStack(alignment: .top) {
                Toggle(isOn: Binding(
                    get: { self.service.autoUpdateClaudeMdEnabled },
                    set: { self.service.autoUpdateClaudeMdEnabled = $0 }))
                {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Auto-update CLAUDE.md with spend status")
                        Text("Appends spend status and optimization tips to your project's CLAUDE.md " +
                            "every 5 minutes, so Claude Code reads them automatically.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button(self.claudeMdUpdatedFlash ? "Updated ✓" : "Update CLAUDE.md now") {
                    Task {
                        await self.service.updateClaudeMdNow()
                        self.claudeMdUpdatedFlash = true
                        try? await Task.sleep(for: .seconds(2))
                        self.claudeMdUpdatedFlash = false
                    }
                }
                .controlSize(.small)
            }

            Button("Apply overrides") {
                self.applyOverrides()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.small)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func loadOverrideFields() {
        self.overrides = VeyrOverrides.load()
        self.sessionCapText = self.overrides.sessionBudgetCapUsd.map { String(format: "%.2f", $0) } ?? ""
        self.compactThresholdText = self.overrides.autoCompactAboveTokens.map(String.init) ?? ""
    }

    private func applyOverrides() {
        self.overrides.sessionBudgetCapUsd = Double(self.sessionCapText.replacingOccurrences(of: ",", with: "."))
        self.overrides.autoCompactAboveTokens = Int(self.compactThresholdText)
        try? self.overrides.save()
    }

    // MARK: - Feed footer

    private var agentFeedFooter: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Agent feed")
                    .font(.caption.weight(.medium))
                Text(VeyrAgentStatusWriter.statusFileURL().path)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                if let wrote = self.service.lastWroteAt {
                    Text("Last written \(wrote.formatted(.dateTime.hour().minute().second()))")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
            Spacer()
            Button("Copy path") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(
                    VeyrAgentStatusWriter.statusFileURL().path, forType: .string)
            }
            .controlSize(.small)
        }
        .padding(14)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }
}
