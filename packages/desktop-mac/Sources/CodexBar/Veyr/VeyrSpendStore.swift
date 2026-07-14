// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation
import Observation
import VeyrKit

/// App-side store for Veyr session spend. Wraps `VeyrSessionScanner` (which does
/// the JSONL parsing and caching in CodexBarCore) and republishes results for
/// SwiftUI. Refreshes every 60 seconds while started, and on demand.
@MainActor
@Observable
public final class VeyrSpendStore {
    public private(set) var sessions: [SessionEntry] = []
    public private(set) var lastRefreshedAt: Date?
    public private(set) var isRefreshing = false
    public private(set) var latestActivityAt: Date?
    /// Feature-tag filter for the Spend dashboard (menu "Top: tag" navigation).
    public var dashboardFilterTag: String?
    /// Selected tab in the Veyr window (0 = Spend, 1 = Agent).
    public var dashboardSelectedTab = 0

    private let scanner: VeyrSessionScanner
    private var refreshTask: Task<Void, Never>?
    private var activeRefresh: Task<Void, Never>?
    private static let refreshInterval: Duration = .seconds(60)

    public init(scanner: VeyrSessionScanner = VeyrSessionScanner()) {
        self.scanner = scanner
    }

    /// Starts the periodic refresh loop (idempotent).
    public func start() {
        guard self.refreshTask == nil else { return }
        self.refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: Self.refreshInterval)
            }
        }
    }

    public func stop() {
        self.refreshTask?.cancel()
        self.refreshTask = nil
    }

    /// Coalescing: a call made while a refresh is in flight waits for that
    /// refresh instead of skipping, so callers always see fresh data after.
    public func refresh() async {
        if let active = self.activeRefresh {
            await active.value
            return
        }
        let task = Task { await self.performRefresh() }
        self.activeRefresh = task
        await task.value
        self.activeRefresh = nil
    }

    /// Display-window retention in days (0 = unlimited). The underlying Claude
    /// logs are never touched — this only limits what Veyr shows and aggregates.
    public static let retentionDefaultsKey = "veyrDataRetentionDays"

    public static var retentionDays: Int {
        get {
            UserDefaults.standard.object(forKey: Self.retentionDefaultsKey) as? Int ?? 90
        }
        set {
            UserDefaults.standard.set(newValue, forKey: Self.retentionDefaultsKey)
        }
    }

    private func performRefresh() async {
        self.isRefreshing = true
        defer { self.isRefreshing = false }
        let scanner = self.scanner
        var scanned = await Task.detached(priority: .utility) {
            scanner.scan()
        }.value
        let retention = Self.retentionDays
        if retention > 0,
           let cutoff = Calendar.current.date(byAdding: .day, value: -retention, to: Date())
        {
            scanned = scanned.filter { $0.timestamp >= cutoff }
        }
        self.sessions = scanned
        self.latestActivityAt = scanner.latestActivityAt()
        self.lastRefreshedAt = Date()
    }

    /// Clears the parsed-session cache and rescans from the raw logs.
    public func clearHistory() async {
        self.scanner.resetCache()
        await self.refresh()
    }

    /// True while a watched session log was modified in the last 60 seconds.
    public var isSessionActive: Bool {
        guard let latest = self.latestActivityAt else { return false }
        return Date().timeIntervalSince(latest) < 60
    }

    // MARK: - Aggregations

    public var todaySpend: (costUSD: Double, sessionCount: Int) {
        let start = Calendar.current.startOfDay(for: Date())
        return SessionSpendAggregator.totalCost(sessions: self.sessions, since: start)
    }

    public var thisWeekSpend: (costUSD: Double, sessionCount: Int) {
        let calendar = Calendar.current
        let start = calendar.dateInterval(of: .weekOfYear, for: Date())?.start
            ?? calendar.startOfDay(for: Date())
        return SessionSpendAggregator.totalCost(sessions: self.sessions, since: start)
    }

    public var thisMonthSpend: (costUSD: Double, sessionCount: Int) {
        let calendar = Calendar.current
        let start = calendar.dateInterval(of: .month, for: Date())?.start
            ?? calendar.startOfDay(for: Date())
        return SessionSpendAggregator.totalCost(sessions: self.sessions, since: start)
    }

    /// Last 7 calendar days, oldest first, with zero-filled gaps for the chart.
    public var last7Days: [DailySpend] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        guard let windowStart = calendar.date(byAdding: .day, value: -6, to: today) else { return [] }
        let recent = self.sessions.filter { $0.timestamp >= windowStart }
        var byDay: [Date: DailySpend] = [:]
        for spend in SessionSpendAggregator.dailySpend(sessions: recent, calendar: calendar) {
            byDay[spend.date] = spend
        }
        return (0...6).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: offset, to: windowStart) else { return nil }
            return byDay[day] ?? DailySpend(date: day)
        }
    }

    /// Feature tags ranked by spend this month.
    public var monthlyTagSpend: [(tag: String, costUSD: Double, sessionCount: Int)] {
        let calendar = Calendar.current
        let start = calendar.dateInterval(of: .month, for: Date())?.start
            ?? calendar.startOfDay(for: Date())
        var byTag: [String: (costUSD: Double, sessionCount: Int)] = [:]
        for session in self.sessions where session.timestamp >= start {
            var bucket = byTag[session.featureTag] ?? (0, 0)
            bucket.costUSD += session.usage.costUSD
            bucket.sessionCount += 1
            byTag[session.featureTag] = bucket
        }
        return byTag
            .map { (tag: $0.key, costUSD: $0.value.costUSD, sessionCount: $0.value.sessionCount) }
            .sorted { $0.costUSD > $1.costUSD }
    }
}
