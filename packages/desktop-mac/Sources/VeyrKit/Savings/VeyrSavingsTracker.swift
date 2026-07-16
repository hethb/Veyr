// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Folds one tick's live observation of the current session into
/// VeyrSavingsStore's running baselines/totals. Driven from
/// VeyrAgentStatusService.tick() (every 30s while a session is active), so
/// this must be revision-aware: a 1-hour session produces ~120 ticks of the
/// SAME logical sample, not 120 new samples.
public enum VeyrSavingsTracker {
    static let ledgerMaxAge: TimeInterval = 24 * 60 * 60

    /// `graphFileCount` is nil when Graphify isn't active for this tick;
    /// non-nil (the repo's file count) when it is. `guidanceOn` is the
    /// current `autoUpdateGuidanceEnabled` state.
    public static func fold(
        session: SessionEntry,
        signals: VeyrSessionSignals?,
        graphFileCount: Int?,
        guidanceOn: Bool,
        into store: inout VeyrSavingsStore,
        now: Date = Date())
    {
        guard let sessionId = session.sessionId else { return }
        let readFilesCount = signals?.readFiles?.count ?? 0

        var state = store.openSessions[sessionId]
            ?? VeyrSavingsStore.OpenSessionState(lastSeenAt: now, featureTag: session.featureTag)
        state.lastSeenAt = now

        Self.foldComponent1(
            graphActive: graphFileCount != nil,
            graphFileCount: graphFileCount,
            readFilesCount: readFilesCount,
            modelId: session.modelId,
            featureTag: session.featureTag,
            state: &state,
            store: &store)

        if state.guidanceOnAtStart == nil { state.guidanceOnAtStart = guidanceOn }
        Self.foldComponent3(
            guidanceOnAtStart: state.guidanceOnAtStart ?? guidanceOn,
            outputTokens: Double(session.usage.outputTokens),
            entryCount: session.entryCount,
            modelId: session.modelId,
            featureTag: session.featureTag,
            state: &state,
            store: &store)

        store.openSessions[sessionId] = state
        store.openSessions = store.openSessions.filter {
            now.timeIntervalSince($0.value.lastSeenAt) <= Self.ledgerMaxAge
        }
    }

    // MARK: - Component 1: graph exploration

    private static func foldComponent1(
        graphActive: Bool,
        graphFileCount: Int?,
        readFilesCount: Int,
        modelId: String,
        featureTag: String,
        state: inout VeyrSavingsStore.OpenSessionState,
        store: inout VeyrSavingsStore)
    {
        // fileCount — and therefore tier — is only ever knowable from a LIVE
        // graph. Cache it per project so a later no-graph tick for the SAME
        // project (the common case this baseline exists to observe) can
        // still be tiered using a past graph build, not just this instant's.
        if let fileCount = graphFileCount {
            let tier = VeyrSavingsCalculator.tier(fileCount: fileCount)
            state.tier = tier
            store.projectTiers[featureTag] = tier
        } else if state.tier == nil {
            state.tier = store.projectTiers[featureTag]
        }
        // Tier-unknowable (no graph has EVER been built for this project):
        // skip component 1 entirely this tick — documented limitation, not
        // a silent wrong bucket.
        guard let tier = state.tier else { return }

        // Sticky-graph transition: session was accumulating into the
        // no-graph baseline and a graph just became active for the first
        // time — retract it so it doesn't double-count on both sides.
        if graphActive, !state.graphEverActive, state.foldedIntoBaseline,
           let lastCount = state.lastFoldedReadCount
        {
            var baseline = store.graphTierBaselines[tier] ?? .init()
            baseline.sumReads -= Double(lastCount)
            baseline.sessionCount = max(0, baseline.sessionCount - 1)
            store.graphTierBaselines[tier] = baseline
            state.foldedIntoBaseline = false
            state.lastFoldedReadCount = nil
        }
        if graphActive { state.graphEverActive = true }

        if state.graphEverActive {
            let baseline = store.graphTierBaselines[tier] ?? .init()
            let estimate = VeyrSavingsCalculator.graphExplorationSavings(
                fileCount: graphFileCount ?? Self.tierRepresentativeFileCount(tier),
                sessionReadFilesCount: readFilesCount,
                baseline: baseline,
                modelId: modelId)
            let isAssumption = estimate.tier == .assumption

            if isAssumption != state.lastFoldedComponent1IsAssumption {
                // The measured/assumption bucket flipped mid-session (the
                // baseline crossed its sample-size gate while this session
                // was still open) — a delta-replace only makes sense within
                // one bucket, so retract the full old contribution and add
                // the full new one instead.
                Self.addComponent1(
                    tokens: -state.lastFoldedComponent1Tokens,
                    usd: -state.lastFoldedComponent1USD,
                    isAssumption: state.lastFoldedComponent1IsAssumption,
                    featureTag: featureTag, store: &store)
                Self.addComponent1(
                    tokens: estimate.tokens, usd: estimate.usd, isAssumption: isAssumption,
                    featureTag: featureTag, store: &store)
            } else {
                Self.addComponent1(
                    tokens: estimate.tokens - state.lastFoldedComponent1Tokens,
                    usd: estimate.usd - state.lastFoldedComponent1USD,
                    isAssumption: isAssumption, featureTag: featureTag, store: &store)
            }
            state.lastFoldedComponent1Tokens = estimate.tokens
            state.lastFoldedComponent1USD = estimate.usd
            state.lastFoldedComponent1IsAssumption = isAssumption
            state.lastFoldedReadCount = readFilesCount
            state.foldedIntoBaseline = false
        } else {
            // No-graph session: fold/revise into the baseline itself.
            var baseline = store.graphTierBaselines[tier] ?? .init()
            if let last = state.lastFoldedReadCount {
                baseline.sumReads += Double(readFilesCount - last)
            } else {
                baseline.sumReads += Double(readFilesCount)
                baseline.sessionCount += 1
            }
            store.graphTierBaselines[tier] = baseline
            state.lastFoldedReadCount = readFilesCount
            state.foldedIntoBaseline = true
        }
    }

    private static func addComponent1(
        tokens: Double, usd: Double, isAssumption: Bool,
        featureTag: String, store: inout VeyrSavingsStore)
    {
        func apply(_ totals: inout VeyrSavingsStore.SavingsTotals) {
            if isAssumption {
                totals.component1AssumptionTokens += tokens
                totals.component1AssumptionUSD += usd
            } else {
                totals.component1MeasuredTokens += tokens
                totals.component1MeasuredUSD += usd
            }
        }
        apply(&store.lifetimeTotals)
        var project = store.perProjectTotals[featureTag] ?? .init()
        apply(&project)
        store.perProjectTotals[featureTag] = project
    }

    private static func tierRepresentativeFileCount(_ tier: String) -> Int {
        switch tier {
        case "small": 25
        case "medium": 100
        default: 300
        }
    }

    // MARK: - Component 3: guidance verbosity

    private static func foldComponent3(
        guidanceOnAtStart: Bool,
        outputTokens: Double,
        entryCount: Int,
        modelId: String,
        featureTag: String,
        state: inout VeyrSavingsStore.OpenSessionState,
        store: inout VeyrSavingsStore)
    {
        let deltaTokens = outputTokens - state.lastFoldedOutputTokens
        let deltaEntries = entryCount - state.lastFoldedEntryCount
        if guidanceOnAtStart {
            store.guidanceOnOutputPerTurn.sumOutputTokens += deltaTokens
            store.guidanceOnOutputPerTurn.turnCount += deltaEntries
        } else {
            store.guidanceOffOutputPerTurn.sumOutputTokens += deltaTokens
            store.guidanceOffOutputPerTurn.turnCount += deltaEntries
        }
        state.lastFoldedOutputTokens = outputTokens
        state.lastFoldedEntryCount = entryCount

        // A savings estimate only makes sense for a guidance-ON session
        // (comparing itself against the OFF population) — an OFF session
        // is itself one of the baseline's own data points, not something
        // to estimate savings for.
        guard guidanceOnAtStart,
              let estimate = VeyrSavingsCalculator.guidanceVerbositySavings(
                  guidanceOn: store.guidanceOnOutputPerTurn,
                  guidanceOff: store.guidanceOffOutputPerTurn,
                  sessionEntryCount: entryCount,
                  modelId: modelId)
        else {
            if state.lastFoldedComponent3Tokens != 0 || state.lastFoldedComponent3USD != 0 {
                Self.addComponent3(
                    tokens: -state.lastFoldedComponent3Tokens, usd: -state.lastFoldedComponent3USD,
                    featureTag: featureTag, store: &store)
                state.lastFoldedComponent3Tokens = 0
                state.lastFoldedComponent3USD = 0
            }
            return
        }
        Self.addComponent3(
            tokens: estimate.tokens - state.lastFoldedComponent3Tokens,
            usd: estimate.usd - state.lastFoldedComponent3USD,
            featureTag: featureTag, store: &store)
        state.lastFoldedComponent3Tokens = estimate.tokens
        state.lastFoldedComponent3USD = estimate.usd
    }

    private static func addComponent3(
        tokens: Double, usd: Double, featureTag: String, store: inout VeyrSavingsStore)
    {
        store.lifetimeTotals.component3CorrelationalTokens += tokens
        store.lifetimeTotals.component3CorrelationalUSD += usd
        var project = store.perProjectTotals[featureTag] ?? .init()
        project.component3CorrelationalTokens += tokens
        project.component3CorrelationalUSD += usd
        store.perProjectTotals[featureTag] = project
    }
}
