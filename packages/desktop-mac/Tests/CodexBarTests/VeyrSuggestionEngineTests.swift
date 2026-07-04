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
        daysAgo: Double = 1,
        projectPath: String? = nil) -> SessionEntry
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
            projectPath: projectPath ?? "/Users/x/\(tag)",
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
    func `wrong model rule needs a single dominant frontier model`() {
        // 3 opus + 3 haiku: no model exceeds 50% — must not fire.
        let sessions = (0..<3).map { day in
            session(tag: "split", cost: 1.0, input: 1000, entries: 10, daysAgo: Double(day))
        } + (0..<3).map { day in
            session(
                tag: "split", model: "claude-haiku-4-5", cost: 1.0, input: 1000,
                entries: 10, daysAgo: Double(day) + 0.5)
        }
        let suggestions = VeyrSuggestionEngine.analyze(sessions: sessions)
        #expect(!suggestions.contains { $0.action == .switchModel })
    }

    @Test
    func `low cache rule fires only with a recurring project path`() {
        // 21 sessions, low cache coverage, all in one projectPath → fires.
        let recurring = (0..<21).map { i in
            session(
                tag: "nocache", cost: 0.5, input: 10_000, output: 200, cacheRead: 500,
                daysAgo: Double(i) * 0.5)
        }
        #expect(VeyrSuggestionEngine.analyze(sessions: recurring)
            .contains { $0.action == .enableCaching })

        // Same sessions spread across unique paths → repeated-context condition fails.
        let scattered = (0..<21).map { i in
            session(
                tag: "nocache", cost: 0.5, input: 10_000, output: 200, cacheRead: 500,
                daysAgo: Double(i) * 0.5, projectPath: "/Users/x/proj-\(i)")
        }
        #expect(!VeyrSuggestionEngine.analyze(sessions: scattered)
            .contains { $0.action == .enableCaching })
    }

    @Test
    func `long output rule compares output to full context`() {
        // 11 sessions, 2000 output vs 200 context per turn (>3×) → fires.
        let chatty = (0..<11).map { i in
            session(
                tag: "chatty", cost: 0.5, input: 200, output: 2000, entries: 1,
                daysAgo: Double(i))
        }
        #expect(VeyrSuggestionEngine.analyze(sessions: chatty)
            .contains { $0.action == .addOutputConstraints })

        // 400 output vs 200 context (<3×) → silent.
        let terse = (0..<11).map { i in
            session(
                tag: "terse", cost: 0.5, input: 200, output: 400, entries: 1,
                daysAgo: Double(i))
        }
        #expect(!VeyrSuggestionEngine.analyze(sessions: terse)
            .contains { $0.action == .addOutputConstraints })
    }

    @Test
    func `context file rule needs five-plus sessions on four-plus days`() {
        // 6 sessions/day on 4 distinct days → fires.
        let bursty = (1...4).flatMap { day in
            (0..<6).map { _ in
                session(tag: "bursty", cost: 0.2, input: 2000, daysAgo: Double(day))
            }
        }
        #expect(VeyrSuggestionEngine.analyze(sessions: bursty)
            .contains { $0.action == .useContextFile })

        // Only 3 busy days → silent.
        let threeDays = (1...3).flatMap { day in
            (0..<6).map { _ in
                session(tag: "bursty3", cost: 0.2, input: 2000, daysAgo: Double(day))
            }
        }
        #expect(!VeyrSuggestionEngine.analyze(sessions: threeDays)
            .contains { $0.action == .useContextFile })
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
