import CodexBarCore
import Foundation
import Testing

struct VeyrAgentStatusBuilderTests {
    private func makeSession(
        costUSD: Double = 2.50,
        inputTokens: Int = 2000,
        cacheRead: Int = 8000,
        entryCount: Int = 10,
        model: String = "claude-opus-4-8",
        tag: String = "veyr",
        minutesAgoStarted: Double = 10) -> SessionEntry
    {
        SessionEntry(
            timestamp: Date(),
            startedAt: Date().addingTimeInterval(-minutesAgoStarted * 60),
            provider: "claude",
            modelId: model,
            featureTag: tag,
            usage: TokenUsage(
                inputTokens: inputTokens,
                outputTokens: 900,
                cacheReadTokens: cacheRead,
                costUSD: costUSD),
            projectPath: "/Users/x/projects/\(tag)",
            entryCount: entryCount)
    }

    @Test
    func `builds current session with budget percentages and alert at 80pct`() {
        let controls = VeyrBudgetControls(
            globalMonthlyCapUSD: 50,
            perTag: ["veyr": .init(monthlyCapUSD: 3.0)])
        let payload = VeyrAgentStatusBuilder.build(
            sessions: [makeSession()],
            latestActivityAt: Date(),
            controls: controls)

        #expect(payload.currentSession?.project == "veyr")
        #expect(payload.currentSession?.isActive == true)
        #expect(payload.budget.projectPctUsed == 83)
        #expect(payload.alerts.contains { $0.level == "warning" })
    }

    @Test
    func `runaway session recommends compaction`() {
        let payload = VeyrAgentStatusBuilder.build(
            sessions: [makeSession(costUSD: 3.0)],
            latestActivityAt: Date(),
            controls: VeyrBudgetControls())
        #expect(payload.recommendations.contains { $0.action == "compact_context" })
    }

    @Test
    func `idle sessions produce no realtime recommendations`() {
        let payload = VeyrAgentStatusBuilder.build(
            sessions: [makeSession(costUSD: 3.0, inputTokens: 20000)],
            latestActivityAt: Date().addingTimeInterval(-3600),
            controls: VeyrBudgetControls())
        #expect(payload.currentSession?.isActive == false)
        #expect(!payload.recommendations.contains { $0.action == "compact_context" })
    }

    @Test
    func `light turns on a frontier model recommend switching down`() {
        // 10 entries × <500 avg fresh input tokens on opus, cost above the floor.
        let payload = VeyrAgentStatusBuilder.build(
            sessions: [makeSession(costUSD: 1.0, inputTokens: 3000, entryCount: 10)],
            latestActivityAt: Date(),
            controls: VeyrBudgetControls())
        let switchRec = payload.recommendations.first { $0.action == "switch_model" }
        #expect(switchRec?.suggestedModel == "claude-haiku-4-5")
    }

    @Test
    func `no sessions yields empty-feed instructions`() {
        let payload = VeyrAgentStatusBuilder.build(
            sessions: [],
            latestActivityAt: nil,
            controls: VeyrBudgetControls())
        #expect(payload.currentSession == nil)
        #expect(payload.agentInstructions.contains("No recent"))
    }
}

struct VeyrClaudeMdSectionTests {
    private func makePayload() -> VeyrAgentStatusPayload {
        VeyrAgentStatusBuilder.build(
            sessions: [],
            latestActivityAt: nil,
            controls: VeyrBudgetControls())
    }

    @Test
    func `appends to content without section`() {
        let result = VeyrAgentStatusWriter.replacingManagedSection(
            in: "# Project\n",
            with: "<!-- veyr:spend-status:begin -->\nX\n<!-- veyr:spend-status:end -->")
        #expect(result.contains("# Project"))
        #expect(result.contains("veyr:spend-status:begin"))
    }

    @Test
    func `replaces existing section without duplication`() {
        let section1 = "\(VeyrAgentStatusWriter.claudeMdSectionBegin)\nOLD\n\(VeyrAgentStatusWriter.claudeMdSectionEnd)"
        let content = "# P\n\n\(section1)\n"
        let section2 = "\(VeyrAgentStatusWriter.claudeMdSectionBegin)\nNEW\n\(VeyrAgentStatusWriter.claudeMdSectionEnd)"
        let result = VeyrAgentStatusWriter.replacingManagedSection(in: content, with: section2)
        #expect(result.contains("NEW"))
        #expect(!result.contains("OLD"))
        #expect(result.components(separatedBy: VeyrAgentStatusWriter.claudeMdSectionBegin).count == 2)
    }

    @Test
    func `nil removes the section and keeps the rest`() {
        let section = "\(VeyrAgentStatusWriter.claudeMdSectionBegin)\nX\n\(VeyrAgentStatusWriter.claudeMdSectionEnd)"
        let content = "# P\nBody.\n\n\(section)\n"
        let result = VeyrAgentStatusWriter.replacingManagedSection(in: content, with: nil)
        #expect(!result.contains("veyr:spend-status"))
        #expect(result.contains("Body."))
    }
}
