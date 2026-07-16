// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Turns a VeyrSavingsStore (running baselines/totals) plus one session's
/// live signals into display-ready, confidence-tagged numbers. Pure — no
/// I/O, no mutation (mirrors VeyrGraphContextBuilder's "pure" contract).
/// This is the exact, inspectable methodology behind the savings tracker —
/// every formula here is documented at the point of use, not buried.
public enum VeyrSavingsCalculator {
    /// Minimum no-graph sessions in a size tier before component 1 uses the
    /// MEASURED (personalized) formula instead of the ASSUMPTION fallback.
    public static let minNoGraphSessionsForMeasured = 5
    /// Minimum turns in EACH of the guidance-on/off populations before
    /// component 3 produces a number at all (no partial-confidence fallback).
    public static let minTurnsForCorrelational = 20
    /// Conservative, deliberately-documented constant: tokens attributed to
    /// one file read (content + surrounding turn overhead). Chosen
    /// independently of — and not claiming consistency with — the unrelated
    /// G3 (200) / G4 (1500) constants in VeyrGraphSuggestionEngine.
    public static let tokensPerFileRead = 500.0

    public enum ConfidenceTier: String, Codable, Sendable {
        case measured
        case assumption
        case correlational
    }

    public struct Estimate: Equatable, Sendable {
        public var tokens: Double
        public var usd: Double
        public var tier: ConfidenceTier
    }

    /// Component 1's size tier — identical boundaries to
    /// VeyrGraphContextBuilder.exploreTokens (<50 / 50-200 / 200+).
    public static func tier(fileCount: Int) -> String {
        fileCount < 50 ? "small" : fileCount < 200 ? "medium" : "large"
    }

    /// Component 1: graph-guided exploration savings for one graph-active
    /// session, given the repo's actual file count (also determines the
    /// tier), its distinct-files-read count, and the user's own historical
    /// baseline for that tier.
    public static func graphExplorationSavings(
        fileCount: Int,
        sessionReadFilesCount: Int,
        baseline: VeyrSavingsStore.TierBaseline,
        modelId: String) -> Estimate
    {
        if baseline.sessionCount >= Self.minNoGraphSessionsForMeasured, let mean = baseline.mean {
            // Measured: compare against this user's own no-graph history in
            // the same size tier.
            let avoidedReads = max(0, mean - Double(sessionReadFilesCount))
            let tokens = avoidedReads * Self.tokensPerFileRead
            return Estimate(
                tokens: tokens,
                usd: ModelPricing.cost(for: modelId, inputTokens: Int(tokens.rounded()), outputTokens: 0),
                tier: .measured)
        }
        // Assumption: not enough personal no-graph history yet (the common
        // case — most users have graph always-on once enabled). Reuses the
        // EXISTING flat heuristic (against the session's real file count,
        // not a synthetic tier-boundary stand-in) rather than inventing a
        // new one, but tags it distinctly so every surface renders it
        // differently from a measured figure.
        let withoutGraph = VeyrGraphContextBuilder.exploreTokens(fileCount: fileCount)
        let tokens = Double(max(0, withoutGraph - VeyrGraphContextBuilder.summaryTokens))
        return Estimate(
            tokens: tokens,
            usd: ModelPricing.cost(for: modelId, inputTokens: Int(tokens.rounded()), outputTokens: 0),
            tier: .assumption)
    }

    /// Component 2: redundant re-reads THIS session — an informational cost
    /// observation, never a savings claim, never fed into any total.
    public static func redundantReadTokens(readCounts: [String: Int]) -> Double {
        let redundantReads = readCounts.values.reduce(0) { $0 + max(0, $1 - 1) }
        return Double(redundantReads) * Self.tokensPerFileRead
    }

    /// Component 3: correlational guidance-verbosity savings. Returns nil
    /// (not zero) when either population is below the sample-size gate —
    /// "no number" is the honest answer, not "$0 saved."
    public static func guidanceVerbositySavings(
        guidanceOn: VeyrSavingsStore.RunningSum,
        guidanceOff: VeyrSavingsStore.RunningSum,
        sessionEntryCount: Int,
        modelId: String) -> Estimate?
    {
        guard guidanceOn.turnCount >= Self.minTurnsForCorrelational,
              guidanceOff.turnCount >= Self.minTurnsForCorrelational,
              let onMean = guidanceOn.mean, let offMean = guidanceOff.mean
        else { return nil }
        let perTurnSavings = max(0, offMean - onMean)
        let tokens = perTurnSavings * Double(sessionEntryCount)
        return Estimate(
            tokens: tokens,
            usd: ModelPricing.cost(for: modelId, inputTokens: 0, outputTokens: Int(tokens.rounded())),
            tier: .correlational)
    }

    /// Verbatim disclaimer every surface must show alongside a component-3
    /// number — correlational, not causal.
    public static let component3Disclaimer =
        "Your average response length changed after enabling guidance — other factors may also " +
        "explain this; this isn't a controlled experiment."
}
