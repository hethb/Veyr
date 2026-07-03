import Foundation

/// Token counts and cost for one session (or one aggregation bucket).
/// Never carries prompt content — counts, cost, and identifiers only.
public struct TokenUsage: Codable, Equatable, Sendable {
    public var inputTokens: Int
    public var outputTokens: Int
    public var cacheReadTokens: Int
    public var cacheWriteTokens: Int
    public var costUSD: Double

    public init(
        inputTokens: Int = 0,
        outputTokens: Int = 0,
        cacheReadTokens: Int = 0,
        cacheWriteTokens: Int = 0,
        costUSD: Double = 0)
    {
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.cacheReadTokens = cacheReadTokens
        self.cacheWriteTokens = cacheWriteTokens
        self.costUSD = costUSD
    }

    public var cacheHitRate: Double {
        let denominator = self.inputTokens + self.cacheReadTokens
        guard denominator > 0 else { return 0 }
        return Double(self.cacheReadTokens) / Double(denominator)
    }

    public static func + (lhs: TokenUsage, rhs: TokenUsage) -> TokenUsage {
        TokenUsage(
            inputTokens: lhs.inputTokens + rhs.inputTokens,
            outputTokens: lhs.outputTokens + rhs.outputTokens,
            cacheReadTokens: lhs.cacheReadTokens + rhs.cacheReadTokens,
            cacheWriteTokens: lhs.cacheWriteTokens + rhs.cacheWriteTokens,
            costUSD: lhs.costUSD + rhs.costUSD)
    }
}

/// One coding-agent session (one JSONL file for Claude Code).
public struct SessionEntry: Identifiable, Codable, Equatable, Sendable {
    public var id: UUID
    /// Timestamp of the most recent activity in the session.
    public var timestamp: Date
    /// Timestamp of the first activity in the session.
    public var startedAt: Date
    public var provider: String
    /// Most frequently used model in the session.
    public var modelId: String
    public var featureTag: String
    public var usage: TokenUsage
    public var projectPath: String?
    /// Provider session identifier (Claude Code's sessionId / log file stem).
    public var sessionId: String?
    /// Number of priced assistant entries aggregated into this session.
    public var entryCount: Int

    public init(
        id: UUID = UUID(),
        timestamp: Date,
        startedAt: Date,
        provider: String,
        modelId: String,
        featureTag: String,
        usage: TokenUsage,
        projectPath: String? = nil,
        sessionId: String? = nil,
        entryCount: Int = 0)
    {
        self.id = id
        self.timestamp = timestamp
        self.startedAt = startedAt
        self.provider = provider
        self.modelId = modelId
        self.featureTag = featureTag
        self.usage = usage
        self.projectPath = projectPath
        self.sessionId = sessionId
        self.entryCount = entryCount
    }

    public var durationMinutes: Double {
        max(0, self.timestamp.timeIntervalSince(self.startedAt)) / 60
    }

    public var costPerMinute: Double {
        let minutes = self.durationMinutes
        guard minutes > 0.5 else { return 0 }
        return self.usage.costUSD / minutes
    }
}

/// Spend aggregated over one calendar day.
public struct DailySpend: Codable, Equatable, Sendable {
    public var date: Date
    public var totalCostUSD: Double
    public var byProvider: [String: Double]
    public var byFeatureTag: [String: Double]
    public var sessionCount: Int

    public init(
        date: Date,
        totalCostUSD: Double = 0,
        byProvider: [String: Double] = [:],
        byFeatureTag: [String: Double] = [:],
        sessionCount: Int = 0)
    {
        self.date = date
        self.totalCostUSD = totalCostUSD
        self.byProvider = byProvider
        self.byFeatureTag = byFeatureTag
        self.sessionCount = sessionCount
    }
}

public enum SessionSpendAggregator {
    /// Groups sessions into calendar-day buckets (session attributed to its last-activity day).
    public static func dailySpend(
        sessions: [SessionEntry],
        calendar: Calendar = .current) -> [DailySpend]
    {
        var byDay: [Date: DailySpend] = [:]
        for session in sessions {
            let day = calendar.startOfDay(for: session.timestamp)
            var bucket = byDay[day] ?? DailySpend(date: day)
            bucket.totalCostUSD += session.usage.costUSD
            bucket.byProvider[session.provider, default: 0] += session.usage.costUSD
            bucket.byFeatureTag[session.featureTag, default: 0] += session.usage.costUSD
            bucket.sessionCount += 1
            byDay[day] = bucket
        }
        return byDay.values.sorted { $0.date < $1.date }
    }

    public static func totalCost(
        sessions: [SessionEntry],
        since: Date,
        until: Date? = nil) -> (costUSD: Double, sessionCount: Int)
    {
        var cost = 0.0
        var count = 0
        for session in sessions where session.timestamp >= since {
            if let until, session.timestamp >= until { continue }
            cost += session.usage.costUSD
            count += 1
        }
        return (cost, count)
    }
}
