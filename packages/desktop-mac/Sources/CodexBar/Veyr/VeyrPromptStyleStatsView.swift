// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import SwiftUI
import VeyrKit

/// The "Style" tab: read-only display of the learned prompt-style corpus.
/// This app has no prompt-entry surface (it's a usage/settings dashboard),
/// so unlike the CLI's `veyr compose` and VS Code's "Compose Prompt", this
/// client only ever consumes/displays the learned stats — never live
/// autocomplete. Reads VeyrPromptStyleStore directly (same process as the
/// daemon; no HTTP round-trip needed for an in-process view).
struct VeyrPromptStyleStatsView: View {
    private static let topPhraseCount = 8
    private static let topReferenceCount = 10

    @State private var learningEnabled = VeyrConfig.load().promptStyleLearning ?? false
    @State private var store = VeyrPromptStyleStore.load()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                self.header
                if self.learningEnabled {
                    if self.store.turnsObserved == 0 {
                        Text("No prompts observed yet — this fills in as you use Claude Code " +
                            "and the Veyr menu bar app ticks (every 30s while a session is active).")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        self.summaryLine
                        self.phraseSection(title: "Common openers", counts: self.store.openers)
                        self.taskShapeSection
                        self.phraseSection(
                            title: "Frequently-referenced files", counts: self.store.referencedFiles)
                        self.phraseSection(
                            title: "Frequently-referenced symbols", counts: self.store.referencedSymbols)
                    }
                }
            }
            .padding(20)
        }
        .frame(minWidth: 680, minHeight: 500)
        .background(.background)
        .onAppear {
            self.learningEnabled = VeyrConfig.load().promptStyleLearning ?? false
            self.store = VeyrPromptStyleStore.load()
        }
    }

    // MARK: - Header + gate

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Learned prompt style")
                .font(.title3.bold())
            Text("An on-device model of how you write prompts — phrasing, task shapes, and " +
                "frequently-referenced files — built entirely from your local Claude Code " +
                "history. Nothing here leaves this machine.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            PreferenceToggleRow(
                title: "Learn from local prompt history",
                subtitle: "Powers ghost-text suggestions in `veyr compose` (CLI) and " +
                    "\"Veyr: Compose Prompt\" (VS Code). Off by default.",
                binding: Binding(
                    get: { self.learningEnabled },
                    set: { newValue in
                        self.learningEnabled = newValue
                        var config = VeyrConfig.load()
                        config.promptStyleLearning = newValue
                        try? config.save()
                        if newValue { self.store = VeyrPromptStyleStore.load() }
                    }))
        }
    }

    // MARK: - Sections (shown only when enabled and data exists)

    private var summaryLine: some View {
        Text("\(self.store.turnsObserved) prompts observed")
            .font(.caption)
            .foregroundStyle(.secondary)
    }

    private var taskShapeSection: some View {
        let total = max(1, self.store.taskShapes.values.reduce(0, +))
        let ranked = self.store.taskShapes.sorted { $0.value > $1.value }
        return VStack(alignment: .leading, spacing: 8) {
            Text("Task shapes")
                .font(.headline)
            ForEach(ranked, id: \.key) { shape, count in
                HStack {
                    Text(shape.replacingOccurrences(of: "_", with: " "))
                        .font(.caption.monospaced())
                    Spacer()
                    Text("\(Int((Double(count) / Double(total) * 100).rounded()))%")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func phraseSection(title: String, counts: [String: Int]) -> some View {
        let ranked = counts.sorted { $0.value > $1.value }.prefix(
            title == "Common openers" ? Self.topPhraseCount : Self.topReferenceCount)
        return Group {
            if !ranked.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text(title)
                        .font(.headline)
                    ForEach(Array(ranked), id: \.key) { text, count in
                        HStack(alignment: .top, spacing: 8) {
                            Text(text)
                                .font(.caption.monospaced())
                                .lineLimit(1)
                                .truncationMode(.tail)
                            Spacer()
                            Text("\(count)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}
