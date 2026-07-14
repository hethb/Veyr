// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Charts
import SwiftUI
import VeyrKit

/// Veyr Spend dashboard: summary cards, 7-day chart, cost by feature tag, and
/// the session timeline. Lives in its own window (CodexBar's menu is an NSMenu,
/// which can't host a scrollable, filterable list).
struct VeyrSpendDashboardView: View {
    @Bindable var store: VeyrSpendStore

    private var selectedTag: String? {
        get { self.store.dashboardFilterTag }
        nonmutating set { self.store.dashboardFilterTag = newValue }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                self.summaryCards
                self.weekChart
                HStack(alignment: .top, spacing: 20) {
                    self.tagList
                        .frame(minWidth: 220, maxWidth: 280)
                    self.sessionTimeline
                        .frame(maxWidth: .infinity)
                }
                self.tipsSection
            }
            .padding(20)
        }
        .frame(minWidth: 680, minHeight: 620)
        .background(.background)
        .toolbar {
            ToolbarItem(placement: .automatic) {
                if let refreshed = self.store.lastRefreshedAt {
                    Text("Updated \(refreshed.formatted(.dateTime.hour().minute().second()))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await self.store.refresh() }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .disabled(self.store.isRefreshing)
            }
        }
    }

    // MARK: - Summary cards

    private var summaryCards: some View {
        HStack(spacing: 12) {
            self.summaryCard(title: "Today", spend: self.store.todaySpend)
            self.summaryCard(title: "This week", spend: self.store.thisWeekSpend)
            self.summaryCard(title: "This month", spend: self.store.thisMonthSpend)
        }
    }

    private func summaryCard(
        title: String,
        spend: (costUSD: Double, sessionCount: Int)) -> some View
    {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(VeyrFormat.usd(spend.costUSD))
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .monospacedDigit()
            Text("^[\(spend.sessionCount) session](inflect: true)")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - 7-day chart

    private var weekChart: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Last 7 days")
                .font(.headline)
            Chart(self.store.last7Days, id: \.date) { day in
                BarMark(
                    x: .value("Day", day.date, unit: .day),
                    y: .value("Spend", day.totalCostUSD))
                    .foregroundStyle(.tint)
                    .cornerRadius(3)
            }
            .chartXAxis {
                AxisMarks(values: .stride(by: .day)) { _ in
                    AxisValueLabel(format: .dateTime.weekday(.abbreviated))
                }
            }
            .chartYAxis {
                AxisMarks { value in
                    AxisGridLine()
                    AxisValueLabel {
                        if let cost = value.as(Double.self) {
                            Text(VeyrFormat.usd(cost))
                        }
                    }
                }
            }
            .chartYScale(domain: .automatic(includesZero: true))
            .frame(height: 160)
        }
        .padding(14)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Cost by feature tag

    private var tagList: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("By feature tag")
                .font(.headline)
            if self.store.monthlyTagSpend.isEmpty {
                Text("No sessions this month")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(self.store.monthlyTagSpend, id: \.tag) { entry in
                Button {
                    self.selectedTag = self.selectedTag == entry.tag ? nil : entry.tag
                } label: {
                    HStack {
                        Text(entry.tag)
                            .lineLimit(1)
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(VeyrFormat.usd(entry.costUSD))
                                .monospacedDigit()
                            Text("^[\(entry.sessionCount) session](inflect: true)")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .contentShape(Rectangle())
                    .padding(.vertical, 5)
                    .padding(.horizontal, 8)
                    .background(
                        self.selectedTag == entry.tag ? AnyShapeStyle(.selection) : AnyShapeStyle(.clear),
                        in: RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
            }
            if self.selectedTag != nil {
                Button("Clear filter") { self.selectedTag = nil }
                    .buttonStyle(.link)
                    .font(.caption)
            }
        }
        .padding(14)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    // MARK: - Session timeline

    private var filteredSessions: [SessionEntry] {
        let sessions = self.store.sessions
        let filtered = self.selectedTag.map { tag in
            sessions.filter { $0.featureTag == tag }
        } ?? sessions
        return Array(filtered.prefix(50))
    }

    private var sessionTimeline: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Sessions")
                    .font(.headline)
                if let tag = self.selectedTag {
                    Text("filtered: \(tag)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if self.filteredSessions.isEmpty {
                Text("No sessions yet — run Claude Code and spend appears here.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(self.filteredSessions) { session in
                self.sessionRow(session)
                Divider()
            }
        }
        .padding(14)
        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
    }

    private func sessionRow(_ session: SessionEntry) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(VeyrFormat.sessionTimestamp(session.timestamp))
                        .font(.callout)
                    if self.hasHighCacheHitRate(session) {
                        Text("⚡")
                            .help("Cache hit rate above 30%")
                    }
                    if session.usage.costUSD > 1.0 {
                        Text("⚠")
                            .help("Session cost above $1.00")
                    }
                }
                Text("\(session.provider) · \(String(session.modelId.prefix(20)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(session.featureTag)
                    .font(.caption2)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(.quaternary, in: Capsule())
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(VeyrFormat.usd(session.usage.costUSD))
                    .font(.callout)
                    .monospacedDigit()
                Text("\(VeyrFormat.tokens(session.usage.inputTokens))↓ " +
                    "\(VeyrFormat.tokens(session.usage.outputTokens))↑")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .padding(.vertical, 2)
    }

    // MARK: - Tips (suggestion engine)

    @ViewBuilder
    private var tipsSection: some View {
        VeyrTipsSection(service: VeyrAgentStatusService.shared, store: self.store)
    }

    private func hasHighCacheHitRate(_ session: SessionEntry) -> Bool {
        guard session.usage.inputTokens > 0 else { return session.usage.cacheReadTokens > 0 }
        return Double(session.usage.cacheReadTokens) / Double(session.usage.inputTokens) > 0.3
    }
}
