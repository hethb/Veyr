import Foundation

public enum SuggestionSeverity: String, Codable, Sendable {
    case high, medium, low
}

public enum SuggestionAction: String, Codable, Sendable {
    case switchModel = "switch_model"
    case compactContext = "compact_context"
    case enableCaching = "enable_caching"
    case setBudgetCap = "set_budget_cap"
    case addOutputConstraints = "add_output_constraints"
    case useContextFile = "use_context_file"
}

/// One optimization suggestion. `id` is a stable "rule:tag" string (not a UUID)
/// so dismissals persisted to ~/.veyr/dismissed-suggestions.json survive rescans.
public struct Suggestion: Identifiable, Codable, Equatable, Sendable {
    public var id: String
    public var severity: SuggestionSeverity
    public var action: SuggestionAction
    public var title: String
    public var detail: String
    public var actionLabel: String
    public var estimatedMonthlySavingsUSD: Double
    public var estimatedHourlySavingsUSD: Double
    public var suggestedModel: String?
    public var isQuickWin: Bool

    public init(
        id: String,
        severity: SuggestionSeverity,
        action: SuggestionAction,
        title: String,
        detail: String,
        actionLabel: String,
        estimatedMonthlySavingsUSD: Double,
        estimatedHourlySavingsUSD: Double = 0,
        suggestedModel: String? = nil,
        isQuickWin: Bool = false)
    {
        self.id = id
        self.severity = severity
        self.action = action
        self.title = title
        self.detail = detail
        self.actionLabel = actionLabel
        self.estimatedMonthlySavingsUSD = estimatedMonthlySavingsUSD
        self.estimatedHourlySavingsUSD = estimatedHourlySavingsUSD
        self.suggestedModel = suggestedModel
        self.isQuickWin = isQuickWin
    }
}

/// Rule-based, on-device suggestion engine over the last 30 days of sessions.
/// No server, no AI calls — pure aggregation.
public enum VeyrSuggestionEngine {
    static let frontierMarkers = ["opus", "fable", "gpt-4o", "o1", "o3", "gpt-4-turbo"]
    static let maxSuggestions = 6

    struct TagStats {
        var tag: String
        var sessions: [SessionEntry] = []
        var costUSD = 0.0
        var inputTokens = 0
        var outputTokens = 0
        var cacheReadTokens = 0
        var entryCount = 0

        var avgFreshInputPerTurn: Int {
            self.entryCount > 0 ? self.inputTokens / self.entryCount : 0
        }

        var avgContextPerTurn: Int {
            self.entryCount > 0 ? (self.inputTokens + self.cacheReadTokens) / self.entryCount : 0
        }

        var avgOutputPerTurn: Int {
            self.entryCount > 0 ? self.outputTokens / self.entryCount : 0
        }

        var cacheHitRate: Double {
            let denominator = self.inputTokens + self.cacheReadTokens
            guard denominator > 0 else { return 0 }
            return Double(self.cacheReadTokens) / Double(denominator)
        }
    }

    public static func analyze(
        sessions: [SessionEntry],
        currentSession: SessionEntry? = nil,
        currentSessionIsActive: Bool = false,
        now: Date = Date()) -> [Suggestion]
    {
        guard let windowStart = Calendar.current.date(byAdding: .day, value: -30, to: now) else { return [] }
        let recent = sessions.filter { $0.timestamp >= windowStart }
        let statsByTag = Self.tagStats(sessions: recent)
        let totalCost = recent.reduce(0.0) { $0 + $1.usage.costUSD }

        var suggestions: [Suggestion] = []
        for stats in statsByTag.values {
            if let wrongModel = Self.ruleWrongModel(stats) { suggestions.append(wrongModel) }
            if let lowCache = Self.ruleLowCacheHitRate(stats) { suggestions.append(lowCache) }
            if let longOutputs = Self.ruleLongOutputs(stats) { suggestions.append(longOutputs) }
            if let contextFile = Self.ruleContextFileOpportunity(stats) { suggestions.append(contextFile) }
            if let dominance = Self.ruleBudgetDominance(stats, totalCost: totalCost) {
                suggestions.append(dominance)
            }
        }
        if let runaway = Self.ruleRunawaySession(
            currentSession, isActive: currentSessionIsActive)
        {
            suggestions.append(runaway)
        }

        suggestions.sort { $0.estimatedMonthlySavingsUSD > $1.estimatedMonthlySavingsUSD }
        suggestions = Array(suggestions.prefix(Self.maxSuggestions))
        if let quickWinIndex = suggestions.firstIndex(where: { $0.estimatedMonthlySavingsUSD > 0 }) {
            suggestions[quickWinIndex].isQuickWin = true
        }
        return suggestions
    }

    static func tagStats(sessions: [SessionEntry]) -> [String: TagStats] {
        var byTag: [String: TagStats] = [:]
        for session in sessions {
            var stats = byTag[session.featureTag] ?? TagStats(tag: session.featureTag)
            stats.sessions.append(session)
            stats.costUSD += session.usage.costUSD
            stats.inputTokens += session.usage.inputTokens
            stats.outputTokens += session.usage.outputTokens
            stats.cacheReadTokens += session.usage.cacheReadTokens
            stats.entryCount += session.entryCount
            byTag[session.featureTag] = stats
        }
        return byTag
    }

    static func isFrontier(_ modelId: String) -> Bool {
        let lower = modelId.lowercased()
        guard !lower.contains("mini"), !lower.contains("haiku") else { return false }
        return Self.frontierMarkers.contains { lower.contains($0) }
    }

    // MARK: - Rule 1: wrong model for simple sessions

    /// Cache-aware refinement of the spec rule: fresh input alone undercounts
    /// context for heavily cached sessions, so a session only counts as "simple"
    /// when the full per-turn context (fresh + cache reads) is also small.
    static func ruleWrongModel(_ stats: TagStats) -> Suggestion? {
        guard stats.costUSD > 3.0 else { return nil }
        guard stats.avgFreshInputPerTurn < 500, stats.avgContextPerTurn < 20_000 else { return nil }
        let frontierSessions = stats.sessions.filter { Self.isFrontier($0.modelId) }
        guard frontierSessions.count * 2 > stats.sessions.count else { return nil }

        let anthropic = frontierSessions.contains { $0.modelId.hasPrefix("claude") }
        let suggested = anthropic ? "claude-haiku-4-5" : "gpt-4o-mini"
        let savings = stats.costUSD * 0.80
        return Suggestion(
            id: "wrong-model:\(stats.tag)",
            severity: .high,
            action: .switchModel,
            title: "Switch \(stats.tag) to a faster model",
            detail: "Sessions average \(stats.avgFreshInputPerTurn) fresh input tokens per turn — light work " +
                "for a frontier model. \(suggested) cuts this cost ~80%.",
            actionLabel: "Copy /model \(suggested)",
            estimatedMonthlySavingsUSD: savings,
            suggestedModel: suggested)
    }

    // MARK: - Rule 2: low cache hit rate

    static func ruleLowCacheHitRate(_ stats: TagStats) -> Suggestion? {
        guard stats.sessions.count > 20 else { return nil }
        guard stats.inputTokens > 0,
              Double(stats.cacheReadTokens) / Double(stats.inputTokens) < 0.2 else { return nil }

        let inputCost = stats.sessions.reduce(0.0) { total, session in
            total + ModelPricing.cost(
                for: session.modelId,
                inputTokens: session.usage.inputTokens,
                outputTokens: 0)
        }
        return Suggestion(
            id: "low-cache:\(stats.tag)",
            severity: .medium,
            action: .enableCaching,
            title: "Prompt caching isn't working for \(stats.tag)",
            detail: "Cache reads cover under 20% of input. Adding cache_control breakpoints (or keeping " +
                "sessions alive) reduces input costs up to 90%.",
            actionLabel: "Learn about caching",
            estimatedMonthlySavingsUSD: inputCost * 0.70)
    }

    // MARK: - Rule 3: runaway session (real time)

    static func ruleRunawaySession(_ current: SessionEntry?, isActive: Bool) -> Suggestion? {
        guard let session = current, isActive else { return nil }
        let burnRate = session.costPerMinute
        guard session.usage.costUSD > 2.00 || burnRate > 0.10 else { return nil }
        return Suggestion(
            id: "runaway:\(session.featureTag)",
            severity: burnRate > 0.10 ? .high : .medium,
            action: .compactContext,
            title: "Long-running session in \(session.featureTag)",
            detail: "This \(session.provider) session has cost " +
                String(format: "$%.2f", session.usage.costUSD) +
                String(format: " ($%.3f/min). ", burnRate) +
                "Run /compact to trim accumulated context.",
            actionLabel: "Copy /compact",
            estimatedMonthlySavingsUSD: 0,
            estimatedHourlySavingsUSD: burnRate * 60 * 0.5)
    }

    // MARK: - Rule 4: one tag dominates

    static func ruleBudgetDominance(_ stats: TagStats, totalCost: Double) -> Suggestion? {
        guard totalCost > 5.0 else { return nil }
        let share = stats.costUSD / totalCost
        guard share > 0.60 else { return nil }
        return Suggestion(
            id: "dominant-tag:\(stats.tag)",
            severity: .low,
            action: .setBudgetCap,
            title: "\(stats.tag) is \(Int((share * 100).rounded()))% of your spend",
            detail: "One project dominating spend is fine on purpose — set a budget cap in Controls " +
                "so overruns get flagged automatically.",
            actionLabel: "Set a budget cap",
            estimatedMonthlySavingsUSD: 0)
    }

    // MARK: - Rule 5: very long outputs

    /// Cache-aware: the ratio compares output to the full context (fresh input +
    /// cache reads); comparing to fresh input alone flags every cached session.
    static func ruleLongOutputs(_ stats: TagStats) -> Suggestion? {
        guard stats.sessions.count > 10 else { return nil }
        let avgContext = stats.avgContextPerTurn
        guard avgContext > 0, stats.avgOutputPerTurn > avgContext * 3 else { return nil }

        let outputCost = stats.sessions.reduce(0.0) { total, session in
            total + ModelPricing.cost(
                for: session.modelId,
                inputTokens: 0,
                outputTokens: session.usage.outputTokens)
        }
        return Suggestion(
            id: "long-outputs:\(stats.tag)",
            severity: .medium,
            action: .addOutputConstraints,
            title: "Very long outputs in \(stats.tag)",
            detail: "Responses average \(stats.avgOutputPerTurn) tokens — over 3× the context. Adding " +
                "output-length constraints to prompts saves 30–50% on output tokens.",
            actionLabel: "Copy prompt hint",
            estimatedMonthlySavingsUSD: outputCost * 0.40)
    }

    // MARK: - Rule 6: rapid short sessions / context file opportunity

    static func ruleContextFileOpportunity(_ stats: TagStats) -> Suggestion? {
        let calendar = Calendar.current
        let byDay = Dictionary(grouping: stats.sessions) { calendar.startOfDay(for: $0.timestamp) }
        let busiestDayCount = byDay.values.map(\.count).max() ?? 0
        guard busiestDayCount > 5, byDay.keys.count >= 2 else { return nil }

        let freshInputCost = stats.sessions.reduce(0.0) { total, session in
            total + ModelPricing.cost(
                for: session.modelId,
                inputTokens: session.usage.inputTokens,
                outputTokens: 0)
        }
        return Suggestion(
            id: "context-file:\(stats.tag)",
            severity: .low,
            action: .useContextFile,
            title: "Many short sessions in \(stats.tag)",
            detail: "Up to \(busiestDayCount) sessions in a single day. A VEYR_CONTEXT.md handoff file " +
                "lets each new session start warm instead of re-explaining context.",
            actionLabel: "Copy file template",
            estimatedMonthlySavingsUSD: freshInputCost * 0.30)
    }
}

/// Persisted dismissals for the Tips UI (`~/.veyr/dismissed-suggestions.json`).
public struct VeyrDismissedSuggestions: Codable, Equatable, Sendable {
    public var ids: Set<String>

    public init(ids: Set<String> = []) {
        self.ids = ids
    }

    public static func fileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.home(base: base).appendingPathComponent("dismissed-suggestions.json")
    }

    public static func load(from url: URL = Self.fileURL()) -> VeyrDismissedSuggestions {
        guard let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(VeyrDismissedSuggestions.self, from: data)
        else { return VeyrDismissedSuggestions() }
        return decoded
    }

    public func save(to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: url, options: [.atomic])
    }
}
