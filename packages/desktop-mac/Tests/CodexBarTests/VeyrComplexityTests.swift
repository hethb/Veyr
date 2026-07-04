// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation
import Testing

struct VeyrClassifierRequestTests {
    @Test
    func `request body uses haiku, caching, and truncated inputs`() throws {
        let longMessage = String(repeating: "x", count: 2000)
        let data = try VeyrTaskComplexityClassifier.requestBody(
            userMessage: longMessage, assistantResponse: "done", model: "claude-opus-4-8")
        let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]

        #expect(object["model"] as? String == "claude-haiku-4-5")
        #expect(object["max_tokens"] as? Int == 150)
        let system = object["system"] as! [[String: Any]]
        #expect((system[0]["cache_control"] as? [String: String])?["type"] == "ephemeral")
        let userContent = ((object["messages"] as! [[String: Any]])[0]["content"] as! String)
        #expect(userContent.count < 1200) // 500-char truncation applied
    }

    @Test
    func `parses plain and fenced JSON responses`() throws {
        let inner = """
        {"complexity":"simple","reasoning":"file read","suggestedModel":"claude-haiku-4-5","estimatedTokensNeeded":300}
        """
        for text in [inner, "```json\n\(inner)\n```"] {
            let response = try JSONSerialization.data(withJSONObject: [
                "content": [["type": "text", "text": text]],
            ])
            let result = try VeyrTaskComplexityClassifier.parseResponse(response)
            #expect(result.complexity == .simple)
            #expect(result.suggestedModel == "claude-haiku-4-5")
        }
    }
}

struct VeyrTurnExtractorTests {
    private func makeLog(_ lines: [String]) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("veyr-turns-\(UUID().uuidString).jsonl")
        try (lines.joined(separator: "\n") + "\n").write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    @Test
    func `pairs user and assistant turns and skips tool results`() throws {
        let url = try makeLog([
            #"{"type":"user","cwd":"/Users/x/proj","message":{"role":"user","content":"read main.swift"}}"#,
            #"{"type":"assistant","sessionId":"s1","timestamp":"2026-07-04T10:00:00Z","message":{"model":"claude-opus-4-8","content":[{"type":"text","text":"Here it is."}],"usage":{"input_tokens":100,"output_tokens":50}}}"#,
            #"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"…"}]}}"#,
            #"{"type":"assistant","sessionId":"s1","message":{"model":"claude-opus-4-8","content":[{"type":"text","text":"Tool follow-up."}],"usage":{"input_tokens":10,"output_tokens":5}}}"#,
        ])
        defer { try? FileManager.default.removeItem(at: url) }

        let result = VeyrTurnExtractor.extractNewTurns(
            from: url, offset: 0, startAtEndIfNew: false)
        // Second assistant message has no fresh user text (tool_result was skipped
        // and the first user message was already consumed).
        #expect(result.turns.count == 1)
        #expect(result.turns[0].userText == "read main.swift")
        #expect(result.turns[0].cwd == "/Users/x/proj")
        #expect(result.turns[0].inputTokens == 100)
        #expect(result.newOffset > 0)
    }

    @Test
    func `first sight of a large file skips the backlog`() throws {
        let url = try makeLog([
            #"{"type":"user","message":{"role":"user","content":"old backlog"}}"#,
        ])
        defer { try? FileManager.default.removeItem(at: url) }
        let result = VeyrTurnExtractor.extractNewTurns(from: url, offset: 0)
        #expect(result.turns.isEmpty)
        #expect(result.newOffset > 0) // parked at EOF
    }
}

struct VeyrWastedCostAndRule7Tests {
    @Test
    func `wasted cost is the delta between used and recommended models`() {
        let wasted = VeyrClassificationRecord.wastedCost(
            modelUsed: "claude-opus-4",
            modelRecommended: "claude-haiku-4",
            inputTokens: 1_000_000,
            outputTokens: 0)
        // $15/M vs $0.80/M input
        #expect(abs(wasted - 14.20) < 0.01)

        #expect(VeyrClassificationRecord.wastedCost(
            modelUsed: "claude-haiku-4",
            modelRecommended: "claude-haiku-4",
            inputTokens: 1_000_000, outputTokens: 0) == 0)
    }

    private func record(
        tag: String, complexity: String, model: String = "claude-opus-4-8",
        wasted: Double) -> VeyrClassificationRecord
    {
        VeyrClassificationRecord(
            sessionId: "s", timestamp: Date(), featureTag: tag,
            complexity: complexity, modelUsed: model,
            modelRecommended: "claude-haiku-4-5", estimatedTokensNeeded: 300,
            actualInputTokens: 1000, actualOutputTokens: 200, wastedCostUSD: wasted)
    }

    @Test
    func `rule 7 fires on high simple share with real waste`() {
        // 4 of 10 turns simple-on-frontier (40% > 30%), $2.40 wasted (> $2).
        let records = (0..<4).map { _ in record(tag: "veyr", complexity: "simple", wasted: 0.60) }
            + (0..<6).map { _ in record(tag: "veyr", complexity: "complex", wasted: 0) }
        let suggestions = VeyrSuggestionEngine.analyze(sessions: [], classifications: records)
        let mismatch = suggestions.first { $0.id == "ai-mismatch:veyr" }
        #expect(mismatch != nil)
        #expect(abs((mismatch?.estimatedMonthlySavingsUSD ?? 0) - 2.40) < 0.01)
    }

    @Test
    func `rule 7 silent below thresholds`() {
        // Only 20% simple → no fire.
        let lowShare = (0..<2).map { _ in record(tag: "a", complexity: "simple", wasted: 3.0) }
            + (0..<8).map { _ in record(tag: "a", complexity: "complex", wasted: 0) }
        #expect(!VeyrSuggestionEngine.analyze(sessions: [], classifications: lowShare)
            .contains { $0.action == .switchModel })

        // High share but < $2 wasted → no fire.
        let lowWaste = (0..<5).map { _ in record(tag: "b", complexity: "simple", wasted: 0.10) }
            + (0..<5).map { _ in record(tag: "b", complexity: "complex", wasted: 0) }
        #expect(!VeyrSuggestionEngine.analyze(sessions: [], classifications: lowWaste)
            .contains { $0.action == .switchModel })
    }
}
