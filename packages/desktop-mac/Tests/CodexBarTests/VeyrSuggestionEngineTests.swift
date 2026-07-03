import CodexBarCore
import Foundation
import Testing

struct VeyrSuggestionEngineTests {
    private func session(
        tag: String,
        model: String = "claude-opus-4-8",
        cost: Double,
        input: Int,
        output: Int = 500,
        cacheRead: Int = 0,
        entries: Int = 5,
        daysAgo: Double = 1) -> SessionEntry
    {
        let timestamp = Date().addingTimeInterval(-daysAgo * 86400)
        return SessionEntry(
            timestamp: timestamp,
            startedAt: timestamp.addingTimeInterval(-300),
            provider: "claude",
            modelId: model,
            featureTag: tag,
            usage: TokenUsage(
                inputTokens: input,
                outputTokens: output,
                cacheReadTokens: cacheRead,
                costUSD: cost),
            projectPath: "/Users/x/\(tag)",
            entryCount: entries)
    }

    @Test
    func `wrong model rule fires on light frontier sessions`() {
        let sessions = (0..<6).map { day in
            session(tag: "light", cost: 1.0, input: 1000, cacheRead: 2000, entries: 10, daysAgo: Double(day))
        }
        let suggestions = VeyrSuggestionEngine.analyze(sessions: sessions)
        let switchRec = suggestions.first { $0.action == .switchModel }
        #expect(switchRec?.suggestedModel == "claude-haiku-4-5")
        #expect(switchRec?.estimatedMonthlySavingsUSD == 6.0 * 0.8)
    }

    @Test
    func `wrong model rule is cache-aware`() {
        // Tiny fresh input but 200k context per turn via cache — deep work, not light.
        let sessions = (0..<6).map { day in
            session(
                tag: "deep", cost: 1.0, input: 1000, cacheRead: 2_000_000,
                entries: 10, daysAgo: Double(day))
        }
        let suggestions = VeyrSuggestionEngine.analyze(sessions: sessions)
        #expect(!suggestions.contains { $0.action == .switchModel })
    }

    @Test
    func `haiku sessions never trigger the wrong model rule`() {
        let sessions = (0..<6).map { day in
            session(
                tag: "cheap", model: "claude-haiku-4-5", cost: 1.0, input: 1000,
                entries: 10, daysAgo: Double(day))
        }
        let suggestions = VeyrSuggestionEngine.analyze(sessions: sessions)
        #expect(!suggestions.contains { $0.action == .switchModel })
    }

    @Test
    func `dominance rule fires above 60 percent`() {
        let sessions = [
            session(tag: "big", cost: 9.0, input: 9000),
            session(tag: "small", cost: 1.0, input: 9000),
        ]
        let suggestions = VeyrSuggestionEngine.analyze(sessions: sessions)
        #expect(suggestions.contains { $0.id == "dominant-tag:big" })
        #expect(!suggestions.contains { $0.id == "dominant-tag:small" })
    }

    @Test
    func `runaway rule needs an active session`() {
        let hot = session(tag: "hot", cost: 5.0, input: 9000, daysAgo: 0)
        let active = VeyrSuggestionEngine.analyze(
            sessions: [hot], currentSession: hot, currentSessionIsActive: true)
        #expect(active.contains { $0.action == .compactContext })

        let idle = VeyrSuggestionEngine.analyze(
            sessions: [hot], currentSession: hot, currentSessionIsActive: false)
        #expect(!idle.contains { $0.action == .compactContext })
    }

    @Test
    func `top non-zero-savings suggestion is the quick win`() {
        let sessions = (0..<6).map { day in
            session(tag: "light", cost: 1.0, input: 1000, cacheRead: 2000, entries: 10, daysAgo: Double(day))
        } + [session(tag: "small", cost: 0.5, input: 9000)]
        let suggestions = VeyrSuggestionEngine.analyze(sessions: sessions)
        let quickWins = suggestions.filter(\.isQuickWin)
        #expect(quickWins.count == 1)
        #expect(quickWins.first?.estimatedMonthlySavingsUSD ?? 0 > 0)
        #expect(suggestions.first?.isQuickWin == true)
    }

    @Test
    func `sessions older than 30 days are ignored`() {
        let sessions = (0..<6).map { day in
            session(tag: "old", cost: 1.0, input: 1000, entries: 10, daysAgo: 40 + Double(day))
        }
        let suggestions = VeyrSuggestionEngine.analyze(sessions: sessions)
        #expect(suggestions.isEmpty)
    }
}
