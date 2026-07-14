// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
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
    case filterTools = "filter_tools"
    case trimSystemPrompt = "trim_system_prompt"
    case improveErrorHandling = "improve_error_handling"
    case useStructuredOutputs = "use_structured_outputs"
    case useBatchApi = "use_batch_api"
    /// Graph rules G1/G3/G4: point the agent at the Graphify summary in
    /// VEYR_STATUS.json / CLAUDE.md instead of re-exploring files.
    case useGraphContext = "use_graph_context"
    /// Graph rules G2/G5: risk alerts on high-connectivity nodes.
    case writeTestFirst = "write_test_first"
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
    /// Populated for output-constraint suggestions (avg output tokens per turn).
    public var avgOutputTokens: Int?

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
        isQuickWin: Bool = false,
        avgOutputTokens: Int? = nil)
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
        self.avgOutputTokens = avgOutputTokens
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
        classifications: [VeyrClassificationRecord] = [],
        signals: [VeyrSessionSignals] = [],
        toolFilteringEnabled: Bool = true,
        now: Date = Date()) -> [Suggestion]
    {
        guard let windowStart = Calendar.current.date(byAdding: .day, value: -30, to: now) else { return [] }
        let recent = sessions.filter { $0.timestamp >= windowStart }
        let statsByTag = Self.tagStats(sessions: recent)
        let totalCost = recent.reduce(0.0) { $0 + $1.usage.costUSD }

        // Signals grouped by tag (sessionId → tag from the scanned sessions).
        let tagBySession = Dictionary(
            sessions.map { ($0.sessionId, $0.featureTag) },
            uniquingKeysWith: { first, _ in first })
        let signalsByTag = Dictionary(grouping: signals.filter { $0.lastTimestamp >= windowStart }) {
            tagBySession[$0.sessionId] ?? FeatureTagInferrer(overrides: [:]).inferTag(from: $0.cwd)
        }
        let classificationStore = VeyrClassificationStore(entries: classifications)
        let complexityByTag = classificationStore.monthlyStatsByTag(
            now: now, isFrontier: Self.isFrontier)

        var suggestions: [Suggestion] = []
        for stats in statsByTag.values {
            if let wrongModel = Self.ruleWrongModel(stats) { suggestions.append(wrongModel) }
            if let lowCache = Self.ruleLowCacheHitRate(stats) { suggestions.append(lowCache) }
            if let longOutputs = Self.ruleLongOutputs(stats) { suggestions.append(longOutputs) }
            if let contextFile = Self.ruleContextFileOpportunity(stats) { suggestions.append(contextFile) }
            if let dominance = Self.ruleBudgetDominance(stats, totalCost: totalCost) {
                suggestions.append(dominance)
            }
            if toolFilteringEnabled,
               let toolBloat = Self.ruleToolBloat(stats, signals: signalsByTag[stats.tag] ?? [])
            {
                suggestions.append(toolBloat)
            }
            if let bloatedSystem = Self.ruleBloatedSystemPrompt(stats) {
                suggestions.append(bloatedSystem)
            }
            if let retries = Self.ruleRetryLoops(stats, signals: signalsByTag[stats.tag] ?? []) {
                suggestions.append(retries)
            }
            if let outputWaste = Self.ruleOutputWaste(
                stats, complexityStats: complexityByTag[stats.tag])
            {
                suggestions.append(outputWaste)
            }
        }
        if let runaway = Self.ruleRunawaySession(
            currentSession, isActive: currentSessionIsActive)
        {
            suggestions.append(runaway)
        }
        suggestions.append(contentsOf: Self.ruleAIModelMismatch(
            classifications: classifications, now: now))

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

    public static func isFrontier(_ modelId: String) -> Bool {
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
        // Dominant model = used in >50% of the tag's sessions (frequency count).
        let frequency = Dictionary(grouping: stats.sessions, by: \.modelId).mapValues(\.count)
        guard let dominant = frequency.max(by: { $0.value < $1.value }),
              dominant.value * 2 > stats.sessions.count,
              Self.isFrontier(dominant.key)
        else { return nil }

        let suggested = dominant.key.hasPrefix("claude") ? "claude-haiku-4-5" : "gpt-4o-mini"
        let savings = stats.costUSD * 0.80
        return Suggestion(
            id: "wrong-model:\(stats.tag)",
            severity: .high,
            action: .switchModel,
            title: "Switch \(stats.tag) to a faster model",
            detail: "Most \(stats.tag) sessions run on \(dominant.key), but they average " +
                "\(stats.avgFreshInputPerTurn) fresh input tokens per turn — light work for a " +
                "frontier model. \(suggested) cuts this cost ~80%.",
            actionLabel: "Copy /model \(suggested)",
            estimatedMonthlySavingsUSD: savings,
            suggestedModel: suggested)
    }

    // MARK: - Rule 2: low cache hit rate

    static func ruleLowCacheHitRate(_ stats: TagStats) -> Suggestion? {
        guard stats.sessions.count > 20 else { return nil }
        guard stats.inputTokens > 0,
              Double(stats.cacheReadTokens) / Double(stats.inputTokens) < 0.2 else { return nil }
        // Caching only pays off for repeated context: require one projectPath
        // to recur across >10 sessions.
        let pathCounts = Dictionary(grouping: stats.sessions, by: \.projectPath).mapValues(\.count)
        guard (pathCounts.values.max() ?? 0) > 10 else { return nil }

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
            // Remaining-session estimate (next hour at current burn) × 0.60.
            estimatedHourlySavingsUSD: burnRate * 60 * 0.60)
    }

    // MARK: - Rule 7: AI-detected model mismatch (from classifier data)

    static func ruleAIModelMismatch(
        classifications: [VeyrClassificationRecord],
        now: Date,
        calendar: Calendar = .current) -> [Suggestion]
    {
        guard !classifications.isEmpty else { return [] }
        let store = VeyrClassificationStore(entries: classifications)
        let statsByTag = store.monthlyStatsByTag(
            now: now, calendar: calendar, isFrontier: Self.isFrontier)

        return statsByTag.values.compactMap { stats in
            guard stats.classifiedTurns >= 5,
                  stats.simpleOnFrontierPct > 0.30,
                  stats.wastedCostUSD > 2.00
            else { return nil }
            let pct = Int((stats.simpleOnFrontierPct * 100).rounded())
            let wasted = String(format: "$%.2f", stats.wastedCostUSD)
            return Suggestion(
                id: "ai-mismatch:\(stats.tag)",
                severity: .high,
                action: .switchModel,
                title: "AI analysis: \(pct)% of \(stats.tag) tasks are simple",
                detail: "AI analysis found that \(pct)% of your \(stats.tag) tasks are simple. " +
                    "You spent \(wasted) this month using a frontier model for tasks that " +
                    "claude-haiku-4-5 handles equally well.",
                actionLabel: "Copy /model claude-haiku-4-5",
                estimatedMonthlySavingsUSD: stats.wastedCostUSD,
                suggestedModel: "claude-haiku-4-5")
        }
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
            estimatedMonthlySavingsUSD: outputCost * 0.40,
            avgOutputTokens: stats.avgOutputPerTurn)
    }

    // MARK: - Rule 8: tool list bloat (approximation: distinct tools *called*
    // across the tag stand in for "loaded"; definitions aren't in the logs)

    static func ruleToolBloat(_ stats: TagStats, signals: [VeyrSessionSignals]) -> Suggestion? {
        let withTools = signals.filter { $0.toolUseCount > 0 }
        guard withTools.count > 15 else { return nil }
        let distinct = Set(withTools.flatMap(\.toolNames))
        let avgUnique = Double(withTools.reduce(0) { $0 + $1.toolNames.count })
            / Double(withTools.count)
        guard distinct.count > 8, avgUnique < 3 else { return nil }

        let unused = Double(distinct.count) - avgUnique
        let dominantModel = Dictionary(grouping: stats.sessions, by: \.modelId)
            .max { $0.value.count < $1.value.count }?.key ?? "claude-sonnet-5"
        // ~50 tokens per unused tool definition, billed on every session turn.
        let savings = ModelPricing.cost(
            for: dominantModel,
            inputTokens: Int(unused * 50) * withTools.count,
            outputTokens: 0)
        return Suggestion(
            id: "tool-bloat:\(stats.tag)",
            severity: .medium,
            action: .filterTools,
            title: "Too many tools loaded for \(stats.tag) sessions",
            detail: "Your \(stats.tag) sessions have used \(distinct.count) distinct tools overall " +
                "but only ~\(Int(avgUnique.rounded())) per session. Each unused tool definition " +
                "still costs tokens every turn — filter tools to those relevant to the task.",
            actionLabel: "Copy tool-filtering hint",
            estimatedMonthlySavingsUSD: savings)
    }

    // MARK: - Rule 9: bloated system prompt (large fresh prefix, poor caching)

    static func ruleBloatedSystemPrompt(_ stats: TagStats) -> Suggestion? {
        guard stats.sessions.count >= 5 else { return nil }
        guard stats.avgFreshInputPerTurn > 800, stats.cacheHitRate < 0.30 else { return nil }
        let dominantModel = Dictionary(grouping: stats.sessions, by: \.modelId)
            .max { $0.value.count < $1.value.count }?.key ?? "claude-sonnet-5"
        let conditionalTokens = (stats.avgFreshInputPerTurn - 400) * stats.entryCount
        let savings = ModelPricing.cost(
            for: dominantModel, inputTokens: max(0, conditionalTokens), outputTokens: 0)
        return Suggestion(
            id: "bloated-system:\(stats.tag)",
            severity: .medium,
            action: .trimSystemPrompt,
            title: "System prompt may contain unused conditional sections for \(stats.tag)",
            detail: "Turns average \(stats.avgFreshInputPerTurn) fresh input tokens with only " +
                "\(Int((stats.cacheHitRate * 100).rounded()))% cache coverage — a large prompt " +
                "prefix is being re-sent. Move tool-specific instructions into the tool " +
                "definitions, or include conditional sections only when they apply.",
            actionLabel: "Copy trimming hint",
            estimatedMonthlySavingsUSD: savings)
    }

    // MARK: - Rule 10: retry loops

    static func ruleRetryLoops(_ stats: TagStats, signals: [VeyrSessionSignals]) -> Suggestion? {
        let clusters = signals.reduce(0) { $0 + $1.retryClusters }
        guard clusters > 5 else { return nil }
        let avgSessionCost = stats.sessions.isEmpty
            ? 0 : stats.costUSD / Double(stats.sessions.count)
        // Estimate: each cluster wastes roughly half a session's cost in re-billed turns.
        let savings = Double(clusters) * avgSessionCost * 0.5
        return Suggestion(
            id: "retry-loops:\(stats.tag)",
            severity: .high,
            action: .improveErrorHandling,
            title: "Retry loops detected in \(stats.tag) — each retry costs full tokens",
            detail: "Your \(stats.tag) sessions show \(clusters) retry clusters where the agent " +
                "repeated a request after an error. Structured error responses (what failed, " +
                "what's needed, how to fix it) let the agent correct itself in one turn.",
            actionLabel: "Copy error-handling hint",
            estimatedMonthlySavingsUSD: savings)
    }

    // MARK: - Rule 11: absolute output waste on simple work (classifier-gated)

    static func ruleOutputWaste(
        _ stats: TagStats,
        complexityStats: VeyrClassificationStore.TagComplexityStats?) -> Suggestion?
    {
        guard stats.sessions.count > 10, stats.avgOutputPerTurn > 1500 else { return nil }
        guard let complexity = complexityStats,
              complexity.classifiedTurns >= 5,
              complexity.simpleOnFrontierPct > 0.5
        else { return nil }

        let outputCost = stats.sessions.reduce(0.0) { total, session in
            total + ModelPricing.cost(
                for: session.modelId, inputTokens: 0, outputTokens: session.usage.outputTokens)
        }
        let excessShare = Double(stats.avgOutputPerTurn - 500) / Double(stats.avgOutputPerTurn)
        return Suggestion(
            id: "output-waste:\(stats.tag)",
            severity: .medium,
            action: .addOutputConstraints,
            title: "Long responses to simple tasks in \(stats.tag) — output costs ~4x input",
            detail: "Your \(stats.tag) sessions average \(stats.avgOutputPerTurn) output tokens " +
                "while most classified tasks are simple. Add 'be concise, respond in under 300 " +
                "words unless the task requires more' to your prompts, or cap max_tokens.",
            actionLabel: "Copy prompt hint",
            estimatedMonthlySavingsUSD: outputCost * excessShare * 0.5,
            avgOutputTokens: stats.avgOutputPerTurn)
    }

    // MARK: - Rule 6: rapid short sessions / context file opportunity

    static func ruleContextFileOpportunity(_ stats: TagStats) -> Suggestion? {
        let calendar = Calendar.current
        let byDay = Dictionary(grouping: stats.sessions) { calendar.startOfDay(for: $0.timestamp) }
        let busyDays = byDay.values.filter { $0.count > 5 }
        // Spec: >5 sessions per day on >3 different days.
        guard busyDays.count > 3 else { return nil }
        let busiestDayCount = busyDays.map(\.count).max() ?? 0

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
            detail: "More than 5 sessions per day on \(busyDays.count) days (up to \(busiestDayCount) in one " +
                "day). A VEYR_CONTEXT.md handoff file lets each new session start warm instead of " +
                "re-explaining context.",
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
