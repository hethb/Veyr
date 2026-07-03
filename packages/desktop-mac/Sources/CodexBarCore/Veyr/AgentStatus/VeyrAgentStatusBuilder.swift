import Foundation

/// Builds the agent-status payload from scanned sessions and budget controls.
/// Pure — no I/O — so it's fully testable. Recommendation rules here are the
/// real-time (current-session) subset; the Phase 3 suggestion engine adds the
/// 30-day aggregate rules on top.
public enum VeyrAgentStatusBuilder {
    /// A session counts as "active" if its log was touched within this window.
    public static let activeWindowSeconds: TimeInterval = 60

    public static func build(
        sessions: [SessionEntry],
        latestActivityAt: Date?,
        controls: VeyrBudgetControls,
        engineSuggestions: [Suggestion] = [],
        now: Date = Date(),
        calendar: Calendar = .current) -> VeyrAgentStatusPayload
    {
        let current = sessions.max { $0.timestamp < $1.timestamp }
        let isActive = latestActivityAt.map { now.timeIntervalSince($0) < Self.activeWindowSeconds } ?? false

        let currentSession = current.map { session in
            VeyrAgentStatusPayload.CurrentSession(
                provider: session.provider,
                model: session.modelId,
                project: session.featureTag,
                sessionCostUsd: Self.round2(session.usage.costUSD),
                inputTokens: session.usage.inputTokens,
                outputTokens: session.usage.outputTokens,
                cacheReadTokens: session.usage.cacheReadTokens,
                cacheHitRate: Self.round2(session.usage.cacheHitRate),
                sessionDurationMinutes: Self.round1(session.durationMinutes),
                costPerMinute: Self.round3(session.costPerMinute),
                isActive: isActive)
        }

        let budget = Self.budget(
            sessions: sessions,
            currentTag: current?.featureTag,
            controls: controls,
            now: now,
            calendar: calendar)
        let alerts = Self.alerts(budget: budget, currentTag: current?.featureTag)
        var recommendations = Self.recommendations(current: current, isActive: isActive)
        // Merge 30-day engine suggestions; real-time rules win per action.
        let presentActions = Set(recommendations.map(\.action))
        for suggestion in engineSuggestions where !presentActions.contains(suggestion.action.rawValue) {
            recommendations.append(.init(
                id: suggestion.id,
                priority: suggestion.severity.rawValue,
                action: suggestion.action.rawValue,
                suggestedModel: suggestion.suggestedModel,
                reason: suggestion.detail,
                estimatedSavingsPerHourUsd: Self.round2(
                    suggestion.estimatedHourlySavingsUSD > 0
                        ? suggestion.estimatedHourlySavingsUSD
                        : suggestion.estimatedMonthlySavingsUSD / 720)))
        }
        recommendations = Array(recommendations.prefix(6))
        let instructions = Self.instructions(
            session: currentSession,
            budget: budget,
            recommendations: recommendations)

        return VeyrAgentStatusPayload(
            generatedAt: now,
            currentSession: currentSession,
            budget: budget,
            alerts: alerts,
            recommendations: recommendations,
            agentInstructions: instructions)
    }

    // MARK: - Budget

    static func budget(
        sessions: [SessionEntry],
        currentTag: String?,
        controls: VeyrBudgetControls,
        now: Date,
        calendar: Calendar) -> VeyrAgentStatusPayload.Budget
    {
        let monthStart = calendar.dateInterval(of: .month, for: now)?.start
            ?? calendar.startOfDay(for: now)
        let monthSessions = sessions.filter { $0.timestamp >= monthStart }

        let globalSpent = monthSessions.reduce(0.0) { $0 + $1.usage.costUSD }
        let projectSpent = currentTag.map { tag in
            monthSessions.filter { $0.featureTag == tag }.reduce(0.0) { $0 + $1.usage.costUSD }
        } ?? 0

        let projectCap = currentTag.flatMap { controls.perTag[$0]?.monthlyCapUSD }
        let globalCap = controls.globalMonthlyCapUSD

        return VeyrAgentStatusPayload.Budget(
            projectMonthlyCapUsd: projectCap,
            projectSpentThisMonthUsd: Self.round2(projectSpent),
            projectRemainingUsd: projectCap.map { Self.round2(max(0, $0 - projectSpent)) },
            projectPctUsed: projectCap.flatMap { $0 > 0 ? Int((projectSpent / $0 * 100).rounded()) : nil },
            globalMonthlyCapUsd: globalCap,
            globalSpentThisMonthUsd: Self.round2(globalSpent),
            globalRemainingUsd: globalCap.map { Self.round2(max(0, $0 - globalSpent)) },
            globalPctUsed: globalCap.flatMap { $0 > 0 ? Int((globalSpent / $0 * 100).rounded()) : nil })
    }

    static func alerts(
        budget: VeyrAgentStatusPayload.Budget,
        currentTag: String?) -> [VeyrAgentStatusPayload.Alert]
    {
        var alerts: [VeyrAgentStatusPayload.Alert] = []
        if let pct = budget.projectPctUsed, let tag = currentTag {
            if pct >= 100 {
                alerts.append(.init(level: "critical", message: "\(tag) has hit its monthly budget cap."))
            } else if pct >= 80 {
                alerts.append(.init(level: "warning", message: "\(tag) is at \(pct)% of its monthly budget."))
            }
        }
        if let pct = budget.globalPctUsed {
            if pct >= 100 {
                alerts.append(.init(level: "critical", message: "Global monthly budget cap reached."))
            } else if pct >= 80 {
                alerts.append(.init(level: "warning", message: "Global spend is at \(pct)% of the monthly budget."))
            }
        }
        return alerts
    }

    // MARK: - Real-time recommendations (current session)

    static func recommendations(
        current: SessionEntry?,
        isActive: Bool) -> [VeyrAgentStatusPayload.Recommendation]
    {
        guard let session = current else { return [] }
        var recommendations: [VeyrAgentStatusPayload.Recommendation] = []

        // Runaway session → compact.
        let burnRate = session.costPerMinute
        let runawayCost = session.usage.costUSD > 2.00
        let runawayRate = burnRate > 0.10
        if isActive, runawayCost || runawayRate {
            let reason = runawayRate
                ? "Session is burning \(Self.usd(burnRate))/minute. Running /compact now reduces per-turn " +
                    "input cost by cutting accumulated context."
                : "Session has cost \(Self.usd(session.usage.costUSD)) so far. Running /compact trims " +
                    "accumulated context before it grows further."
            recommendations.append(.init(
                id: "compact-context",
                priority: runawayRate ? "high" : "medium",
                action: "compact_context",
                suggestedModel: nil,
                reason: reason,
                estimatedSavingsPerHourUsd: Self.round2(burnRate * 60 * 0.5)))
        }

        // Frontier model on light turns → switch down.
        let avgInputPerTurn = session.entryCount > 0
            ? session.usage.inputTokens / session.entryCount
            : 0
        // Cache-aware: heavy cache reads mean the model is carrying large context
        // even when fresh input is tiny — that is not "light work".
        let avgContextPerTurn = session.entryCount > 0
            ? (session.usage.inputTokens + session.usage.cacheReadTokens) / session.entryCount
            : 0
        let frontier = ["opus", "fable", "gpt-4o", "o1", "o3"]
            .contains { session.modelId.lowercased().contains($0) }
        let isFrontierMini = session.modelId.lowercased().contains("mini")
        if frontier, !isFrontierMini, avgInputPerTurn < 500, avgContextPerTurn < 20_000,
           session.usage.costUSD > 0.50
        {
            let suggested = session.modelId.hasPrefix("claude") ? "claude-haiku-4-5" : "gpt-4o-mini"
            recommendations.append(.init(
                id: "switch-model",
                priority: "high",
                action: "switch_model",
                suggestedModel: suggested,
                reason: "Turns in this session average \(avgInputPerTurn) fresh input tokens — light work " +
                    "for \(session.modelId). Switching to \(suggested) saves ~80% on these turns.",
                estimatedSavingsPerHourUsd: Self.round2(burnRate * 60 * 0.8)))
        }

        return recommendations.sorted { $0.estimatedSavingsPerHourUsd > $1.estimatedSavingsPerHourUsd }
    }

    // MARK: - Agent instructions (the most important field)

    static func instructions(
        session: VeyrAgentStatusPayload.CurrentSession?,
        budget: VeyrAgentStatusPayload.Budget,
        recommendations: [VeyrAgentStatusPayload.Recommendation]) -> String
    {
        guard let session else {
            return "No recent coding-agent session detected. No spend guidance."
        }
        var parts: [String] = []
        parts.append("You are currently spending \(Self.usd(session.costPerMinute))/minute on \(session.model).")
        if let pct = budget.projectPctUsed {
            parts.append("Your project budget (\(session.project)) is \(pct)% used" +
                (budget.projectRemainingUsd.map { " — \(Self.usd($0)) remaining this month" } ?? "") + ".")
        }
        if let pct = budget.globalPctUsed {
            parts.append("Global budget is \(pct)% used.")
        }
        if !recommendations.isEmpty {
            let actions = recommendations.enumerated().map { index, rec -> String in
                switch rec.action {
                case "switch_model":
                    "(\(index + 1)) switch to \(rec.suggestedModel ?? "a smaller model") for tasks that " +
                        "don't need deep reasoning (file edits, simple refactors, reading files, running commands)"
                case "compact_context":
                    "(\(index + 1)) run /compact now to reduce context size"
                default:
                    "(\(index + 1)) \(rec.reason)"
                }
            }
            parts.append("Consider: " + actions.joined(separator: ", ") + ".")
        } else {
            parts.append("Spend profile looks healthy — no changes recommended right now.")
        }
        return parts.joined(separator: " ")
    }

    // MARK: - Markdown rendering (VEYR_PROJECT_STATUS.md)

    public static func markdown(
        payload: VeyrAgentStatusPayload,
        now: Date = Date()) -> String
    {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        let stamp = formatter.string(from: payload.generatedAt)

        var lines: [String] = []
        lines.append("# Veyr spend status")
        let project = payload.currentSession?.project ?? "none"
        lines.append("> Updated \(stamp) · project: \(project)")
        lines.append("")

        if let session = payload.currentSession {
            lines.append("## Current session")
            lines.append("- Model: \(session.model)")
            lines.append("- Session cost: \(Self.usd(session.sessionCostUsd)) " +
                "(\(Int(session.sessionDurationMinutes.rounded())) minutes)")
            lines.append("- Burn rate: \(Self.usd(session.costPerMinute))/min")
            let cachePct = Int((session.cacheHitRate * 100).rounded())
            lines.append("- Cache hit rate: \(cachePct)%\(cachePct >= 30 ? " ⚡" : "")")
            lines.append("")
        }

        lines.append("## Budget")
        if let cap = payload.budget.projectMonthlyCapUsd {
            lines.append("- This project: \(Self.usd(payload.budget.projectSpentThisMonthUsd)) / " +
                "\(Self.usd(cap)) (\(payload.budget.projectPctUsed ?? 0)% used)")
        } else {
            lines.append("- This project: \(Self.usd(payload.budget.projectSpentThisMonthUsd)) this month (no cap set)")
        }
        if let cap = payload.budget.globalMonthlyCapUsd {
            lines.append("- Global: \(Self.usd(payload.budget.globalSpentThisMonthUsd)) / " +
                "\(Self.usd(cap)) (\(payload.budget.globalPctUsed ?? 0)% used)")
        } else {
            lines.append("- Global: \(Self.usd(payload.budget.globalSpentThisMonthUsd)) this month (no cap set)")
        }
        lines.append("")

        if !payload.alerts.isEmpty {
            lines.append("## Alerts")
            for alert in payload.alerts {
                lines.append("- **\(alert.level.uppercased())**: \(alert.message)")
            }
            lines.append("")
        }

        if !payload.recommendations.isEmpty {
            lines.append("## Recommendations")
            for (index, rec) in payload.recommendations.enumerated() {
                let title: String = switch rec.action {
                case "switch_model": "**Switch to \(rec.suggestedModel ?? "a smaller model")**"
                case "compact_context": "**Run /compact**"
                default: "**\(rec.action)**"
                }
                lines.append("\(index + 1). \(title) — \(rec.reason)")
            }
            lines.append("")
        }

        lines.append("## Instructions for this agent")
        lines.append(payload.agentInstructions)
        lines.append("")
        return lines.joined(separator: "\n")
    }

    // MARK: - Helpers

    static func usd(_ value: Double) -> String {
        String(format: "$%.2f", value)
    }

    static func round1(_ value: Double) -> Double { (value * 10).rounded() / 10 }
    static func round2(_ value: Double) -> Double { (value * 100).rounded() / 100 }
    static func round3(_ value: Double) -> Double { (value * 1000).rounded() / 1000 }
}
