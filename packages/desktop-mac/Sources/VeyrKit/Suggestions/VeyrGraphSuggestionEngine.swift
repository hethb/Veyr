// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Graph-powered suggestion rules (G1–G5). Same contract as VeyrSuggestionEngine
/// — pure static rules, stable ids for dismissal persistence, no I/O — but these
/// need a built CodebaseGraph and the active-session focus, so they live apart
/// from the aggregation-only rules and degrade to nothing when the graph is
/// unavailable (Python missing, build pending).
///
/// Priority order G1, G4, G3, G2, G5 is preserved in the returned array; the
/// caller merges with the aggregate rules.
public enum VeyrGraphSuggestionEngine {
    /// Rough tokens for an agent to read one source file (Read tool returns up
    /// to 2000 lines; typical files land well under). Used where the logs don't
    /// record actual read sizes.
    static let tokensPerFileRead = 1500
    /// Tokens of ad-hoc exploration per never-visited import (spec G3).
    static let tokensPerUnexploredImport = 200

    public struct Inputs {
        public var graph: CodebaseGraph?
        public var focused: FocusedContext?
        public var currentSession: SessionEntry?
        public var currentSessionIsActive: Bool
        /// Last 30 days, same window the aggregate engine uses.
        public var sessions: [SessionEntry]
        public var signals: [VeyrSessionSignals]
        /// Repo-relative paths changed in recent git history (stability check
        /// for G4). Supplied by the caller; empty set means "no git data".
        public var recentlyChangedFiles: Set<String>
        public var now: Date

        public init(
            graph: CodebaseGraph? = nil,
            focused: FocusedContext? = nil,
            currentSession: SessionEntry? = nil,
            currentSessionIsActive: Bool = false,
            sessions: [SessionEntry] = [],
            signals: [VeyrSessionSignals] = [],
            recentlyChangedFiles: Set<String> = [],
            now: Date = Date())
        {
            self.graph = graph
            self.focused = focused
            self.currentSession = currentSession
            self.currentSessionIsActive = currentSessionIsActive
            self.sessions = sessions
            self.signals = signals
            self.recentlyChangedFiles = recentlyChangedFiles
            self.now = now
        }
    }

    public static func analyze(_ inputs: Inputs) -> [Suggestion] {
        var suggestions: [Suggestion] = []
        if let g1 = Self.ruleG1LeafNodeOnExpensiveModel(inputs) { suggestions.append(g1) }
        if let g4 = Self.ruleG4RedundantFileReading(inputs) { suggestions.append(g4) }
        if let g3 = Self.ruleG3UnexploredDependencies(inputs) { suggestions.append(g3) }
        if let g2 = Self.ruleG2GodNode(inputs) { suggestions.append(g2) }
        if let g5 = Self.ruleG5TestCoverageGap(inputs) { suggestions.append(g5) }
        return suggestions
    }

    // MARK: - G1: leaf node on expensive model

    /// A simple isolated function being edited on a frontier model. Requires the
    /// derived kind to be `function` — files and symbols also have low degree
    /// without being "simple isolated edits".
    static func ruleG1LeafNodeOnExpensiveModel(_ inputs: Inputs) -> Suggestion? {
        guard let graph = inputs.graph,
              let node = inputs.focused?.activeNode,
              let session = inputs.currentSession,
              inputs.currentSessionIsActive
        else { return nil }
        guard graph.kinds[node.id] == .function,
              graph.totalDegree(node.id) <= 2,
              VeyrSuggestionEngine.isFrontier(session.modelId),
              session.usage.costUSD > 0.50
        else { return nil }

        let suggested = session.modelId.lowercased().contains("claude")
            ? "claude-haiku-4-5" : "gpt-4o-mini"
        let savings = session.usage.costUSD * 0.95
        return Suggestion(
            id: "g1-leaf-model:\(session.featureTag)",
            severity: .high,
            action: .switchModel,
            title: "Expensive model on a leaf function",
            detail: "'\(node.label)' has \(graph.totalDegree(node.id)) connections — it's a " +
                "simple isolated function. \(suggested) handles this at a fraction of " +
                "\(session.modelId)'s cost.",
            actionLabel: "Copy /model \(suggested)",
            estimatedMonthlySavingsUSD: savings,
            suggestedModel: suggested,
            isQuickWin: savings > 1)
    }

    // MARK: - G4: redundant file reading

    /// The agent re-reads the same stable files across sessions in this project.
    /// "Stable" = untouched by recent git history, so the Graphify summary in
    /// VEYR_STATUS.json / CLAUDE.md already covers them.
    static func ruleG4RedundantFileReading(_ inputs: Inputs) -> Suggestion? {
        guard let session = inputs.currentSession,
              let cwd = session.projectPath
        else { return nil }
        guard let windowStart = Calendar.current.date(byAdding: .day, value: -7, to: inputs.now)
        else { return nil }

        let projectSignals = inputs.signals.filter {
            $0.lastTimestamp >= windowStart && $0.cwd == cwd && !($0.readFiles ?? []).isEmpty
        }
        guard projectSignals.count >= 2 else { return nil }

        var sessionCountByFile: [String: Int] = [:]
        for signals in projectSignals {
            for file in Set(signals.readFiles ?? []) {
                sessionCountByFile[file, default: 0] += 1
            }
        }
        let stableRereads = sessionCountByFile.filter { file, count in
            count >= 2 && !Self.isRecentlyChanged(file, cwd: cwd, changed: inputs.recentlyChangedFiles)
        }
        guard stableRereads.count >= 3 else { return nil }

        let rereadsPerSession = stableRereads.count
        let sessionsPerDay = Double(projectSignals.count) / 7.0
        let model = session.modelId
        let dailyCost = ModelPricing.cost(
            for: model,
            inputTokens: rereadsPerSession * Self.tokensPerFileRead,
            outputTokens: 0) * sessionsPerDay
        return Suggestion(
            id: "g4-redundant-reads:\(session.featureTag)",
            severity: .high,
            action: .useGraphContext,
            title: "Agent re-reads stable files every session",
            detail: "Your agent re-reads \(rereadsPerSession) stable files across " +
                "\(session.featureTag) sessions. The Graphify summary in CLAUDE.md / " +
                "VEYR_STATUS.json covers them — point the agent at the graph summary instead.",
            actionLabel: "Copy graph-context hint",
            estimatedMonthlySavingsUSD: dailyCost * 30)
    }

    /// A read is "recently changed" when its repo-relative form appears in the
    /// recent git diff. Read paths are absolute; changed paths are repo-relative.
    package static func isRecentlyChanged(_ readPath: String, cwd: String, changed: Set<String>) -> Bool {
        guard readPath.hasPrefix(cwd) else { return false }
        let relative = String(readPath.dropFirst(cwd.count)).trimmingCharacters(
            in: CharacterSet(charactersIn: "/"))
        return changed.contains(relative)
    }

    // MARK: - G3: unexplored dependency chain

    /// The active file imports files in directories no session has ever worked
    /// in (30-day window) — exploration there will be ad-hoc and expensive.
    static func ruleG3UnexploredDependencies(_ inputs: Inputs) -> Suggestion? {
        guard let graph = inputs.graph,
              let focused = inputs.focused,
              let active = focused.activeNode,
              !focused.imports.isEmpty
        else { return nil }
        guard let windowStart = Calendar.current.date(byAdding: .day, value: -30, to: inputs.now)
        else { return nil }

        let exploredCwds = Set(
            inputs.signals
                .filter { $0.lastTimestamp >= windowStart }
                .compactMap(\.cwd))
        guard !exploredCwds.isEmpty else { return nil }

        let unexplored = focused.imports.filter { imported in
            guard !imported.sourceFile.isEmpty else { return false } // external modules
            let directory = Self.absoluteDirectory(
                of: imported.sourceFile, workspaceRoot: graph.workspaceRoot)
            return !Self.isExplored(directory: directory, cwds: exploredCwds)
        }
        guard unexplored.count >= 2 else { return nil }

        let model = inputs.currentSession?.modelId ?? "claude-sonnet-5"
        let savings = ModelPricing.cost(
            for: model,
            inputTokens: unexplored.count * Self.tokensPerUnexploredImport,
            outputTokens: 0) * 30
        return Suggestion(
            id: "g3-unexplored:\(active.sourceFile)",
            severity: .medium,
            action: .useGraphContext,
            title: "Active file depends on unexplored territory",
            detail: "'\(active.label)' imports \(unexplored.count) files your agent has never " +
                "worked near. Check the graphContext in VEYR_STATUS.json before editing to " +
                "avoid expensive ad-hoc exploration.",
            actionLabel: "Copy graph-context hint",
            estimatedMonthlySavingsUSD: savings)
    }

    package static func absoluteDirectory(of sourceFile: String, workspaceRoot: String) -> String {
        let absolute = sourceFile.hasPrefix("/") ? sourceFile : "\(workspaceRoot)/\(sourceFile)"
        return (absolute as NSString).deletingLastPathComponent
    }

    /// Explored when any session cwd contains the directory or vice versa —
    /// a session at the repo root covers every subdirectory.
    package static func isExplored(directory: String, cwds: Set<String>) -> Bool {
        cwds.contains { cwd in
            directory == cwd
                || directory.hasPrefix(cwd + "/")
                || cwd.hasPrefix(directory + "/")
        }
    }

    // MARK: - G2: god node warning

    /// High-connectivity code — a risk alert, not a savings play. Restricted to
    /// functions and classes: file nodes accumulate `contains` edges for every
    /// declaration, which is size, not impact.
    static func ruleG2GodNode(_ inputs: Inputs) -> Suggestion? {
        guard let graph = inputs.graph,
              let node = inputs.focused?.activeNode,
              let kind = graph.kinds[node.id],
              kind == .function || kind == .class
        else { return nil }
        let degree = graph.totalDegree(node.id)
        guard degree > 20 else { return nil }

        return Suggestion(
            id: "g2-god-node:\(node.id)",
            severity: .high,
            action: .writeTestFirst,
            title: "High-impact code — changes ripple widely",
            detail: "'\(node.label)' has \(degree) connections. Changes here affect a large " +
                "portion of the codebase. Consider writing a test first.",
            actionLabel: "Copy test-first hint",
            estimatedMonthlySavingsUSD: 0)
    }

    // MARK: - G5: test coverage gap

    static func ruleG5TestCoverageGap(_ inputs: Inputs) -> Suggestion? {
        guard let graph = inputs.graph,
              let focused = inputs.focused,
              let node = focused.activeNode,
              let session = inputs.currentSession,
              let kind = graph.kinds[node.id],
              kind == .function || kind == .class
        else { return nil }
        guard focused.relatedTests.isEmpty,
              graph.totalDegree(node.id) > 10
        else { return nil }

        let tagSessions = inputs.sessions.filter { $0.featureTag == session.featureTag }
        let tagCost = tagSessions.reduce(0.0) { $0 + $1.usage.costUSD }
        guard tagCost > 5.0 else { return nil }

        let avgSessionCost = tagCost / Double(max(1, tagSessions.count))
        return Suggestion(
            id: "g5-test-gap:\(node.id)",
            severity: .low,
            action: .writeTestFirst,
            title: "No test coverage on a high-connectivity function",
            detail: "'\(node.label)' has \(graph.totalDegree(node.id)) connections but no " +
                "detected tests. A silent regression here would be expensive to debug.",
            actionLabel: "Copy test-first hint",
            // Estimated debugging cost of a missed regression.
            estimatedMonthlySavingsUSD: 2 * avgSessionCost)
    }
}
