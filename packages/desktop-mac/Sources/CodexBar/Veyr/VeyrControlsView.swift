// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import SwiftUI
import VeyrKit

/// The "Controls" tab: global monthly budget plus per-tag caps with progress
/// bars and alert toggles. Persists to ~/.veyr/budget-controls.json, which both
/// the notifier and the agent feed read.
struct VeyrControlsView: View {
    @Bindable var store: VeyrSpendStore

    @State private var controls = VeyrBudgetControls.load()
    @State private var globalCapText = ""
    @State private var capTexts: [String: String] = [:]
    @State private var savedFlash = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                self.globalBudgetCard
                self.tagBudgetsCard
                self.notificationsCard
            }
            .padding(20)
        }
        .frame(minWidth: 680, minHeight: 620)
        .background(.background)
        .onAppear { self.loadFields() }
    }

    // MARK: - Global cap

    private var globalBudgetCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Global monthly budget")
                .font(.headline)
            HStack {
                Text("$")
                TextField("e.g. 50.00", text: self.$globalCapText)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 100)
                    .onSubmit { self.save() }
                Button("Save") { self.save() }
                    .controlSize(.small)
                if self.savedFlash {
                    Text("Saved ✓")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
                Spacer()
            }
            let month = self.store.thisMonthSpend
            if let cap = self.controls.globalMonthlyCapUSD, cap > 0 {
                self.progressRow(spent: month.costUSD, cap: cap)
            } else {
                Text("\(VeyrFormat.usd(month.costUSD)) spent this month — no cap set")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Per-tag caps

    private var visibleTags: [String] {
        let fromSessions = self.store.monthlyTagSpend.map(\.tag)
        let fromControls = Array(self.controls.perTag.keys)
        var seen = Set<String>()
        return (fromSessions + fromControls.sorted()).filter { seen.insert($0).inserted }
    }

    private var tagBudgetsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Per-project budgets")
                .font(.headline)
            if self.visibleTags.isEmpty {
                Text("No feature tags seen in the last 30 days.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(self.visibleTags, id: \.self) { tag in
                self.tagRow(tag)
                Divider()
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func tagRow(_ tag: String) -> some View {
        let spent = self.store.monthlyTagSpend.first { $0.tag == tag }?.costUSD ?? 0
        let budget = self.controls.perTag[tag]

        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(tag)
                    .font(.callout.weight(.medium))
                Spacer()
                Text(budget.map { "\(VeyrFormat.usd(spent)) / \(VeyrFormat.usd($0.monthlyCapUSD))" }
                    ?? "\(VeyrFormat.usd(spent)) / no cap")
                    .font(.callout)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            if let budget, budget.monthlyCapUSD > 0 {
                self.progressRow(spent: spent, cap: budget.monthlyCapUSD)
            }
            HStack(spacing: 10) {
                Text("Cap: $")
                    .font(.caption)
                TextField("none", text: Binding(
                    get: { self.capTexts[tag] ?? "" },
                    set: { self.capTexts[tag] = $0 }))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 80)
                    .font(.caption)
                    .onSubmit { self.save() }
                Toggle("Alert at 80%", isOn: Binding(
                    get: { self.controls.perTag[tag]?.alertAt80Pct ?? true },
                    set: { newValue in
                        if var existing = self.controls.perTag[tag] {
                            existing.alertAt80Pct = newValue
                            self.controls.perTag[tag] = existing
                            self.save()
                        }
                    }))
                    .toggleStyle(.checkbox)
                    .font(.caption)
                    .disabled(self.controls.perTag[tag] == nil)
                Spacer()
            }
        }
    }

    private func progressRow(spent: Double, cap: Double) -> some View {
        let fraction = min(1.0, spent / cap)
        let color: Color = fraction >= 1.0 ? .red : (fraction >= 0.8 ? .orange : .green)
        return ProgressView(value: fraction)
            .tint(color)
    }

    // MARK: - Notifications toggle

    private var notificationsCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Toggle(isOn: Binding(
                get: {
                    UserDefaults.standard.object(
                        forKey: VeyrBudgetNotifier.notificationsEnabledDefaultsKey) as? Bool ?? true
                },
                set: {
                    UserDefaults.standard.set(
                        $0, forKey: VeyrBudgetNotifier.notificationsEnabledDefaultsKey)
                }))
            {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Budget notifications")
                    Text("Notifies at 80% and 100% of any cap, once per month per threshold.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Load/save

    private func loadFields() {
        self.controls = VeyrBudgetControls.load()
        self.globalCapText = self.controls.globalMonthlyCapUSD.map { String(format: "%.2f", $0) } ?? ""
        self.capTexts = self.controls.perTag.mapValues { String(format: "%.2f", $0.monthlyCapUSD) }
    }

    private func save() {
        self.controls.globalMonthlyCapUSD = Self.parseAmount(self.globalCapText)
        for tag in self.visibleTags {
            let text = self.capTexts[tag] ?? ""
            if let cap = Self.parseAmount(text), cap > 0 {
                var budget = self.controls.perTag[tag] ?? .init(monthlyCapUSD: cap)
                budget.monthlyCapUSD = cap
                self.controls.perTag[tag] = budget
            } else {
                self.controls.perTag.removeValue(forKey: tag)
            }
        }
        try? self.controls.save()
        self.savedFlash = true
        Task {
            try? await Task.sleep(for: .seconds(2))
            self.savedFlash = false
        }
    }

    private static func parseAmount(_ text: String) -> Double? {
        let cleaned = text
            .replacingOccurrences(of: "$", with: "")
            .replacingOccurrences(of: ",", with: ".")
            .trimmingCharacters(in: .whitespaces)
        guard let value = Double(cleaned), value > 0 else { return nil }
        return value
    }
}
