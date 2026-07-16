// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// `~/.veyr/savings.json` — running baselines and totals behind the
/// retrospective savings tracker. Deliberately NOT in cache/: the running
/// baselines capture a fact (was Graphify/guidance live during a historical
/// tick) that only ever existed transiently in the running app's memory —
/// nothing in the JSONL logs can reconstruct it after the fact, so losing
/// this file loses history permanently. See VeyrSavingsCalculator for the
/// exact estimation methodology these fields feed.
public struct VeyrSavingsStore: Codable, Equatable, Sendable {
    public var lastUpdated: Date

    /// Component 1's per-tier no-graph baselines. Key = "small"|"medium"|"large",
    /// matching VeyrGraphContextBuilder.exploreTokens' <50/50-200/200+ tiers.
    public var graphTierBaselines: [String: TierBaseline]

    /// Last-known size tier per project (key = SessionEntry.featureTag),
    /// cached whenever a graph IS active so a LATER no-graph tick for the
    /// SAME project can still be tiered (fileCount is only ever knowable
    /// from a live graph — without this cache, a no-graph session could
    /// never be tiered at all, and the no-graph baseline this feature
    /// depends on could never accumulate anything).
    public var projectTiers: [String: String]

    /// Component 3's two turn-weighted populations.
    public var guidanceOnOutputPerTurn: RunningSum
    public var guidanceOffOutputPerTurn: RunningSum

    /// Small, bounded ledger of sessions currently being observed — NOT a
    /// history log. Exists only so tick()'s repeated observations of the
    /// same in-progress session can be folded as revisions, not new samples.
    public var openSessions: [String: OpenSessionState]

    public var lifetimeTotals: SavingsTotals
    public var perProjectTotals: [String: SavingsTotals]

    public struct TierBaseline: Codable, Equatable, Sendable {
        /// Sum of readFiles.count across folded no-graph sessions in this tier.
        public var sumReads: Double
        /// This IS the "sessionCount >= 5" sample-size gate; mean = sumReads/sessionCount.
        public var sessionCount: Int

        public init(sumReads: Double = 0, sessionCount: Int = 0) {
            self.sumReads = sumReads
            self.sessionCount = sessionCount
        }

        public var mean: Double? {
            sessionCount > 0 ? self.sumReads / Double(self.sessionCount) : nil
        }
    }

    /// Plain sum+count, not a decayed running mean: unlike the prompt-style
    /// corpus (which motivated decay to track drifting vocabulary), how many
    /// files a user reads to explore a repo of a given size — or how their
    /// response length compares with guidance on/off — is a far more stable
    /// per-user quantity, and decay fighting the minimum-sample-size floor
    /// would be a foot-gun (could un-gate a signal by decaying old count
    /// without ever re-accumulating real new samples).
    public struct RunningSum: Codable, Equatable, Sendable {
        public var sumOutputTokens: Double
        public var turnCount: Int

        public init(sumOutputTokens: Double = 0, turnCount: Int = 0) {
            self.sumOutputTokens = sumOutputTokens
            self.turnCount = turnCount
        }

        public var mean: Double? {
            turnCount > 0 ? self.sumOutputTokens / Double(self.turnCount) : nil
        }
    }

    public struct OpenSessionState: Codable, Equatable, Sendable {
        public var lastSeenAt: Date
        public var featureTag: String
        /// Component 1 tier, once fileCount is known; nil while tier-unknowable.
        public var tier: String?
        /// Sticky true once a graph is ever seen active mid-session — the
        /// whole session is then treated as graph-active going forward
        /// (accepted imprecision, comparable to VeyrSignalsScanner's
        /// existing retry-cluster imprecision).
        public var graphEverActive: Bool
        /// Last readFiles.count folded into EITHER the no-graph baseline OR
        /// the graph-active totals (whichever `foldedIntoBaseline` says).
        public var lastFoldedReadCount: Int?
        public var foldedIntoBaseline: Bool
        /// Cumulative output tokens / entry count last folded into the
        /// guidance RunningSum, for delta-replace on the next tick.
        public var lastFoldedOutputTokens: Double
        public var lastFoldedEntryCount: Int
        /// First-observed guidance state for this session; later mid-session
        /// toggles are ignored for attribution (documented limitation).
        public var guidanceOnAtStart: Bool?
        /// Last savings figures folded into lifetime/per-project totals, so
        /// an in-progress session's estimate is revised in place, not re-added.
        public var lastFoldedComponent1Tokens: Double
        public var lastFoldedComponent1USD: Double
        /// Which totals bucket (measured vs assumption) the last fold landed
        /// in — if this flips mid-session (baseline crosses the sample-size
        /// gate while the session is still open), the fold logic retracts
        /// the full amount from the old bucket rather than delta-replacing
        /// across two different buckets.
        public var lastFoldedComponent1IsAssumption: Bool
        public var lastFoldedComponent3Tokens: Double
        public var lastFoldedComponent3USD: Double

        public init(
            lastSeenAt: Date,
            featureTag: String,
            tier: String? = nil,
            graphEverActive: Bool = false,
            lastFoldedReadCount: Int? = nil,
            foldedIntoBaseline: Bool = false,
            lastFoldedOutputTokens: Double = 0,
            lastFoldedEntryCount: Int = 0,
            guidanceOnAtStart: Bool? = nil,
            lastFoldedComponent1Tokens: Double = 0,
            lastFoldedComponent1USD: Double = 0,
            lastFoldedComponent1IsAssumption: Bool = false,
            lastFoldedComponent3Tokens: Double = 0,
            lastFoldedComponent3USD: Double = 0)
        {
            self.lastSeenAt = lastSeenAt
            self.featureTag = featureTag
            self.tier = tier
            self.graphEverActive = graphEverActive
            self.lastFoldedReadCount = lastFoldedReadCount
            self.foldedIntoBaseline = foldedIntoBaseline
            self.lastFoldedOutputTokens = lastFoldedOutputTokens
            self.lastFoldedEntryCount = lastFoldedEntryCount
            self.guidanceOnAtStart = guidanceOnAtStart
            self.lastFoldedComponent1Tokens = lastFoldedComponent1Tokens
            self.lastFoldedComponent1USD = lastFoldedComponent1USD
            self.lastFoldedComponent1IsAssumption = lastFoldedComponent1IsAssumption
            self.lastFoldedComponent3Tokens = lastFoldedComponent3Tokens
            self.lastFoldedComponent3USD = lastFoldedComponent3USD
        }
    }

    public struct SavingsTotals: Codable, Equatable, Sendable {
        public var component1MeasuredTokens: Double
        public var component1MeasuredUSD: Double
        public var component1AssumptionTokens: Double
        public var component1AssumptionUSD: Double
        public var component3CorrelationalTokens: Double
        public var component3CorrelationalUSD: Double
        // Component 2 (redundant reads) is deliberately absent here — it's
        // an informational cost observation, never a savings claim, never
        // totaled. Computed on demand from VeyrSessionSignals.readCounts.

        public init(
            component1MeasuredTokens: Double = 0,
            component1MeasuredUSD: Double = 0,
            component1AssumptionTokens: Double = 0,
            component1AssumptionUSD: Double = 0,
            component3CorrelationalTokens: Double = 0,
            component3CorrelationalUSD: Double = 0)
        {
            self.component1MeasuredTokens = component1MeasuredTokens
            self.component1MeasuredUSD = component1MeasuredUSD
            self.component1AssumptionTokens = component1AssumptionTokens
            self.component1AssumptionUSD = component1AssumptionUSD
            self.component3CorrelationalTokens = component3CorrelationalTokens
            self.component3CorrelationalUSD = component3CorrelationalUSD
        }
    }

    public init(
        lastUpdated: Date = .distantPast,
        graphTierBaselines: [String: TierBaseline] = [:],
        projectTiers: [String: String] = [:],
        guidanceOnOutputPerTurn: RunningSum = RunningSum(),
        guidanceOffOutputPerTurn: RunningSum = RunningSum(),
        openSessions: [String: OpenSessionState] = [:],
        lifetimeTotals: SavingsTotals = SavingsTotals(),
        perProjectTotals: [String: SavingsTotals] = [:])
    {
        self.lastUpdated = lastUpdated
        self.graphTierBaselines = graphTierBaselines
        self.projectTiers = projectTiers
        self.guidanceOnOutputPerTurn = guidanceOnOutputPerTurn
        self.guidanceOffOutputPerTurn = guidanceOffOutputPerTurn
        self.openSessions = openSessions
        self.lifetimeTotals = lifetimeTotals
        self.perProjectTotals = perProjectTotals
    }

    /// Resets one project's totals without touching lifetime totals or any
    /// baseline/population data — "session/project resets should not erase
    /// the lifetime counter."
    public mutating func resetProject(tag: String) {
        self.perProjectTotals[tag] = nil
    }

    // MARK: - Persistence

    public static func fileURL(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        VeyrPaths.savingsStoreFile(base: base)
    }

    public static func load(from url: URL = Self.fileURL()) -> VeyrSavingsStore {
        guard let data = try? Data(contentsOf: url) else { return VeyrSavingsStore() }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(VeyrSavingsStore.self, from: data)) ?? VeyrSavingsStore()
    }

    public func save(to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(self).write(to: url, options: [.atomic])
    }
}
