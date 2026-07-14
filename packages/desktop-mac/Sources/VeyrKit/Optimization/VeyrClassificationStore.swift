// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// One classified session turn. `wastedCostUSD` is the cost difference between
/// the model actually used and the model the classifier recommended — the
/// headline metric ("you wasted $X on expensive models for simple tasks").
public struct VeyrClassificationRecord: Codable, Equatable, Sendable {
    public var sessionId: String
    public var timestamp: Date
    public var featureTag: String
    public var complexity: String // "simple" | "moderate" | "complex"
    public var modelUsed: String
    public var modelRecommended: String
    public var estimatedTokensNeeded: Int
    public var actualInputTokens: Int
    public var actualOutputTokens: Int
    public var wastedCostUSD: Double

    public init(
        sessionId: String,
        timestamp: Date,
        featureTag: String,
        complexity: String,
        modelUsed: String,
        modelRecommended: String,
        estimatedTokensNeeded: Int,
        actualInputTokens: Int,
        actualOutputTokens: Int,
        wastedCostUSD: Double)
    {
        self.sessionId = sessionId
        self.timestamp = timestamp
        self.featureTag = featureTag
        self.complexity = complexity
        self.modelUsed = modelUsed
        self.modelRecommended = modelRecommended
        self.estimatedTokensNeeded = estimatedTokensNeeded
        self.actualInputTokens = actualInputTokens
        self.actualOutputTokens = actualOutputTokens
        self.wastedCostUSD = wastedCostUSD
    }

    /// Cost delta between the used and recommended model for this turn's tokens.
    public static func wastedCost(
        modelUsed: String,
        modelRecommended: String,
        inputTokens: Int,
        outputTokens: Int) -> Double
    {
        let used = ModelPricing.cost(
            for: modelUsed, inputTokens: inputTokens, outputTokens: outputTokens)
        let recommended = ModelPricing.cost(
            for: modelRecommended, inputTokens: inputTokens, outputTokens: outputTokens)
        return max(0, used - recommended)
    }
}

/// Persistent store at `~/.veyr/cache/classifications.json`, plus per-file byte
/// offsets so turn extraction is incremental across app restarts.
public struct VeyrClassificationStore: Codable, Sendable {
    public var entries: [VeyrClassificationRecord]
    public var fileOffsets: [String: UInt64]

    public init(entries: [VeyrClassificationRecord] = [], fileOffsets: [String: UInt64] = [:]) {
        self.entries = entries
        self.fileOffsets = fileOffsets
    }

    public static func fileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.cacheDirectory(base: base).appendingPathComponent("classifications.json")
    }

    public static func load(from url: URL = Self.fileURL()) -> VeyrClassificationStore {
        guard let data = try? Data(contentsOf: url) else { return VeyrClassificationStore() }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(VeyrClassificationStore.self, from: data))
            ?? VeyrClassificationStore()
    }

    public func save(to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: url, options: [.atomic])
    }

    /// Keeps the store bounded: drops entries older than 90 days.
    public mutating func prune(now: Date = Date()) {
        guard let cutoff = Calendar.current.date(byAdding: .day, value: -90, to: now) else { return }
        self.entries.removeAll { $0.timestamp < cutoff }
    }

    // MARK: - Aggregates (this month, per tag)

    public struct TagComplexityStats: Sendable {
        public var tag: String
        public var classifiedTurns: Int
        public var simpleOnFrontierTurns: Int
        public var wastedCostUSD: Double

        public var simpleOnFrontierPct: Double {
            self.classifiedTurns > 0
                ? Double(self.simpleOnFrontierTurns) / Double(self.classifiedTurns)
                : 0
        }
    }

    public func monthlyStatsByTag(
        now: Date = Date(),
        calendar: Calendar = .current,
        isFrontier: (String) -> Bool) -> [String: TagComplexityStats]
    {
        let monthStart = calendar.dateInterval(of: .month, for: now)?.start
            ?? calendar.startOfDay(for: now)
        var byTag: [String: TagComplexityStats] = [:]
        for entry in self.entries where entry.timestamp >= monthStart {
            var stats = byTag[entry.featureTag] ?? TagComplexityStats(
                tag: entry.featureTag, classifiedTurns: 0,
                simpleOnFrontierTurns: 0, wastedCostUSD: 0)
            stats.classifiedTurns += 1
            if entry.complexity == "simple", isFrontier(entry.modelUsed) {
                stats.simpleOnFrontierTurns += 1
                stats.wastedCostUSD += entry.wastedCostUSD
            }
            byTag[entry.featureTag] = stats
        }
        return byTag
    }
}
