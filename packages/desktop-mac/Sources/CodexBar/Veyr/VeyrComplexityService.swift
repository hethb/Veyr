// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation
import Observation
import VeyrKit

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

    /// Completed session awaiting a user rating in the Agent tab, if any.
    public struct FeedbackCandidate: Equatable {
        public var sessionId: String
        public var featureTag: String
        public var model: String
        public var dominantComplexity: String
        public var turnCount: Int
    }

    public private(set) var feedbackCandidate: FeedbackCandidate?
    public private(set) var labeledSampleCount = VeyrTrainingDataStore.labeledCount()

    private static let maxTurnsPerTick = 3

    /// Resolved once per app run (and on Settings changes) — resolving on
    /// every 30s tick would re-prompt for the Keychain item after each
    /// re-signed build.
    @ObservationIgnored
    private var cachedApiKey: String?

    private init() {
        self.refreshAvailability()
    }

    public func refreshAvailability() {
        self.cachedApiKey = VeyrAnthropicKey.resolve()
        self.classifierEnabled = self.cachedApiKey != nil
    }

    public var records: [VeyrClassificationRecord] {
        self.store.entries
    }

    /// Called from the agent-status tick. Returns current records for the engine.
    public func processNewTurns(isSessionActive: Bool) async -> [VeyrClassificationRecord] {
        guard isSessionActive, !self.inFlight else { return self.store.entries }
        guard let apiKey = self.cachedApiKey else {
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
                // ML scaffold: collect a local training sample per classified turn.
                try? VeyrTrainingDataStore.append(VeyrTrainingSample.from(
                    sessionId: turn.sessionId,
                    timestamp: turn.timestamp,
                    userText: turn.userText,
                    llmClassification: result.complexity.rawValue,
                    modelUsed: turn.model,
                    inputTokens: turn.inputTokens,
                    outputTokens: turn.outputTokens))
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

    // MARK: - Session feedback (ML ground truth)

    /// Called each tick: when the latest classified session has gone idle and
    /// none of its samples are labeled yet, offer the rating widget.
    public func refreshFeedbackCandidate(isSessionActive: Bool) {
        guard !isSessionActive else {
            self.feedbackCandidate = nil
            return
        }
        let samples = VeyrTrainingDataStore.loadAll()
        self.labeledSampleCount = samples.count { $0.userFeedbackComplexity != nil }
        guard let latest = samples.max(by: { $0.timestamp < $1.timestamp }) else {
            self.feedbackCandidate = nil
            return
        }
        let sessionSamples = samples.filter { $0.sessionId == latest.sessionId }
        guard !sessionSamples.isEmpty,
              sessionSamples.allSatisfy({ $0.userFeedbackComplexity == nil })
        else {
            self.feedbackCandidate = nil
            return
        }
        var counts: [String: Int] = [:]
        for sample in sessionSamples {
            counts[sample.llmClassification, default: 0] += 1
        }
        let dominant = counts.max { $0.value < $1.value }?.key ?? "simple"
        let tag = self.store.entries
            .last { $0.sessionId == latest.sessionId }?.featureTag ?? "untagged"
        self.feedbackCandidate = FeedbackCandidate(
            sessionId: latest.sessionId,
            featureTag: tag,
            model: latest.modelUsed,
            dominantComplexity: dominant,
            turnCount: sessionSamples.count)
    }

    public func submitFeedback(sessionId: String, complexity: String) {
        try? VeyrTrainingDataStore.recordFeedback(sessionId: sessionId, complexity: complexity)
        self.labeledSampleCount = VeyrTrainingDataStore.labeledCount()
        self.feedbackCandidate = nil
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
