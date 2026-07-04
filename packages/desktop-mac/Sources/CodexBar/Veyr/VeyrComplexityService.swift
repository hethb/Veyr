// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation
import Observation

/// Drives the LLM task-complexity classifier: on each agent-status tick, pulls
/// new turns from the active session log, classifies at most 3 per tick with
/// Haiku (cached system prompt), and persists results + wasted-cost math to
/// `~/.veyr/cache/classifications.json`.
@MainActor
@Observable
public final class VeyrComplexityService {
    public static let shared = VeyrComplexityService()

    @ObservationIgnored
    private let logger = CodexBarLog.logger(LogCategories.veyr)
    @ObservationIgnored
    private var store = VeyrClassificationStore.load()
    @ObservationIgnored
    private var inFlight = false

    /// nil until first resolution attempt; cached per app run (Settings save resets it).
    public private(set) var classifierEnabled = false
    public private(set) var classifiedThisRun = 0
    public private(set) var lastError: String?

    private static let maxTurnsPerTick = 3

    private init() {
        self.refreshAvailability()
    }

    public func refreshAvailability() {
        self.classifierEnabled = VeyrAnthropicKey.resolve() != nil
    }

    public var records: [VeyrClassificationRecord] {
        self.store.entries
    }

    /// Called from the agent-status tick. Returns current records for the engine.
    public func processNewTurns(isSessionActive: Bool) async -> [VeyrClassificationRecord] {
        guard isSessionActive, !self.inFlight else { return self.store.entries }
        guard let apiKey = VeyrAnthropicKey.resolve() else {
            self.classifierEnabled = false
            return self.store.entries
        }
        self.classifierEnabled = true
        guard let file = VeyrTurnExtractor.newestSessionFile() else { return self.store.entries }

        self.inFlight = true
        defer { self.inFlight = false }

        let offset = self.store.fileOffsets[file.path] ?? 0
        let extraction = VeyrTurnExtractor.extractNewTurns(
            from: file, offset: offset, maxTurns: Self.maxTurnsPerTick)
        self.store.fileOffsets[file.path] = extraction.newOffset
        guard !extraction.turns.isEmpty else {
            try? self.store.save()
            return self.store.entries
        }

        let tagInferrer = FeatureTagInferrer.loadingOverrides()
        for turn in extraction.turns {
            let featureTag = tagInferrer.inferTag(from: turn.cwd)
            do {
                let result = try await VeyrTaskComplexityClassifier.classify(
                    userMessage: turn.userText,
                    assistantResponse: turn.assistantText,
                    model: turn.model,
                    apiKey: apiKey)
                let wasted = VeyrClassificationRecord.wastedCost(
                    modelUsed: turn.model,
                    modelRecommended: result.suggestedModel,
                    inputTokens: turn.inputTokens,
                    outputTokens: turn.outputTokens)
                self.store.entries.append(VeyrClassificationRecord(
                    sessionId: turn.sessionId,
                    timestamp: turn.timestamp,
                    featureTag: featureTag,
                    complexity: result.complexity.rawValue,
                    modelUsed: turn.model,
                    modelRecommended: result.suggestedModel,
                    estimatedTokensNeeded: result.estimatedTokensNeeded,
                    actualInputTokens: turn.inputTokens,
                    actualOutputTokens: turn.outputTokens,
                    wastedCostUSD: wasted))
                self.classifiedThisRun += 1
                self.lastError = nil
            } catch {
                self.lastError = String(describing: error)
                self.logger.error(
                    "[Veyr] Turn classification failed",
                    metadata: ["error": String(describing: error)])
                break // rate limit / auth issue — stop burning calls this tick
            }
        }

        self.store.prune()
        try? self.store.save()
        return self.store.entries
    }

    /// Feed block for VEYR_STATUS.json (current tag's month-to-date view).
    public func complexityAnalysis(currentTag: String?) -> VeyrAgentStatusPayload.ComplexityAnalysis {
        let statsByTag = self.store.monthlyStatsByTag { model in
            VeyrSuggestionEngine.isFrontier(model)
        }
        let stats = currentTag.flatMap { statsByTag[$0] }
        return VeyrAgentStatusPayload.ComplexityAnalysis(
            classifierEnabled: self.classifierEnabled,
            classifiedTurnsThisMonth: stats?.classifiedTurns
                ?? statsByTag.values.reduce(0) { $0 + $1.classifiedTurns },
            simpleOnFrontierPct: Int(((stats?.simpleOnFrontierPct ?? 0) * 100).rounded()),
            wastedCostThisMonthUsd: (((stats?.wastedCostUSD ?? 0) * 100).rounded()) / 100)
    }
}
