import CodexBarCore
import Foundation
import Testing

struct VeyrPricingTests {
    @Test
    func `claude models price through upstream pricing`() {
        // claude-sonnet-4 built-in rate: $3/M input, $15/M output.
        let cost = ModelPricing.cost(
            for: "claude-sonnet-4-20250514",
            inputTokens: 1_000_000,
            outputTokens: 1_000_000)
        #expect(cost == 18.0)
    }

    @Test
    func `openai models price via prefix match on the static table`() {
        let cost = ModelPricing.cost(
            for: "gpt-4o-2024-08-06",
            inputTokens: 1_000_000,
            outputTokens: 1_000_000)
        #expect(cost == 12.50)
    }

    @Test
    func `gpt-4o-mini is not shadowed by the gpt-4o prefix`() {
        let cost = ModelPricing.cost(
            for: "gpt-4o-mini-2024-07-18",
            inputTokens: 1_000_000,
            outputTokens: 1_000_000)
        #expect(cost == 0.75)
    }

    @Test
    func `unknown models use the fallback rates`() {
        let cost = ModelPricing.cost(
            for: "totally-new-model",
            inputTokens: 1_000_000,
            outputTokens: 1_000_000)
        #expect(cost == 10.0)
    }

    @Test
    func `cache tokens price at published ratios in fallback path`() {
        // gpt-4o: input $2.50/M. Cache read 10% → $0.25/M; write 125% → $3.125/M.
        let cost = ModelPricing.cost(
            for: "gpt-4o",
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 1_000_000,
            cacheWriteTokens: 1_000_000)
        #expect(abs(cost - (0.25 + 3.125)) < 0.0001)
    }
}

struct FeatureTagInferrerTests {
    @Test
    func `infers last meaningful path component`() {
        let inferrer = FeatureTagInferrer()
        #expect(inferrer.inferTag(from: "/Users/heth/Desktop/Veyr") == "Veyr")
        #expect(inferrer.inferTag(from: "/Users/heth/projects/client-acme") == "client-acme")
    }

    @Test
    func `skips generic folder names`() {
        let inferrer = FeatureTagInferrer()
        #expect(inferrer.inferTag(from: "/Users/someone/code/src/acme-app") == "acme-app")
        #expect(inferrer.inferTag(from: "/Users/someone/code/src") == "someone")
    }

    @Test
    func `nil or empty path is untagged`() {
        let inferrer = FeatureTagInferrer()
        #expect(inferrer.inferTag(from: nil) == "untagged")
        #expect(inferrer.inferTag(from: "") == "untagged")
    }

    @Test
    func `exact override wins`() {
        let inferrer = FeatureTagInferrer(overrides: ["/Users/heth/projects/veyr": "veyr-core"])
        #expect(inferrer.inferTag(from: "/Users/heth/projects/veyr") == "veyr-core")
    }

    @Test
    func `override covers subdirectories by longest prefix`() {
        let inferrer = FeatureTagInferrer(overrides: [
            "/Users/heth/projects": "misc",
            "/Users/heth/projects/veyr": "veyr-core",
        ])
        #expect(inferrer.inferTag(from: "/Users/heth/projects/veyr/packages/cli") == "veyr-core")
        #expect(inferrer.inferTag(from: "/Users/heth/projects/other") == "misc")
    }
}

struct VeyrSessionScannerTests {
    private func makeTempDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("veyr-scanner-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func assistantLine(
        model: String = "claude-sonnet-4-20250514",
        input: Int,
        output: Int,
        cacheRead: Int = 0,
        cacheWrite: Int = 0,
        timestamp: String,
        cwd: String = "/Users/heth/projects/veyr",
        messageId: String? = nil,
        requestId: String? = nil,
        sessionId: String = "sess-1") -> String
    {
        var obj: [String: Any] = [
            "type": "assistant",
            "timestamp": timestamp,
            "cwd": cwd,
            "sessionId": sessionId,
            "message": [
                "model": model,
                "usage": [
                    "input_tokens": input,
                    "output_tokens": output,
                    "cache_read_input_tokens": cacheRead,
                    "cache_creation_input_tokens": cacheWrite,
                ] as [String: Any],
            ] as [String: Any],
        ]
        if let messageId {
            var message = obj["message"] as! [String: Any]
            message["id"] = messageId
            obj["message"] = message
        }
        if let requestId {
            obj["requestId"] = requestId
        }
        let data = try! JSONSerialization.data(withJSONObject: obj)
        return String(data: data, encoding: .utf8)!
    }

    @Test
    func `parses a session file into one entry with summed usage`() throws {
        let root = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: root) }
        let project = root.appendingPathComponent("proj", isDirectory: true)
        try FileManager.default.createDirectory(at: project, withIntermediateDirectories: true)

        let lines = [
            assistantLine(input: 100, output: 50, timestamp: "2026-07-01T10:00:00.000Z"),
            assistantLine(input: 200, output: 80, cacheRead: 500, timestamp: "2026-07-01T10:05:00.000Z"),
            #"{"type":"user","message":{"content":"never read"}}"#,
        ]
        try lines.joined(separator: "\n").write(
            to: project.appendingPathComponent("session-a.jsonl"),
            atomically: true, encoding: .utf8)

        let cacheFile = root.appendingPathComponent("cache.json")
        let scanner = VeyrSessionScanner(cacheFileURL: cacheFile, projectsRoots: [root])
        let sessions = scanner.scan(tagInferrer: FeatureTagInferrer())

        #expect(sessions.count == 1)
        let session = try #require(sessions.first)
        #expect(session.usage.inputTokens == 300)
        #expect(session.usage.outputTokens == 130)
        #expect(session.usage.cacheReadTokens == 500)
        #expect(session.usage.costUSD > 0)
        #expect(session.featureTag == "veyr")
        #expect(session.provider == "claude")
        #expect(session.entryCount == 2)
        #expect(session.sessionId == "sess-1")
        #expect(session.durationMinutes == 5.0)
    }

    @Test
    func `streaming chunks with the same ids are deduplicated, last wins`() throws {
        let root = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: root) }

        let lines = [
            assistantLine(
                input: 100, output: 10, timestamp: "2026-07-01T10:00:00.000Z",
                messageId: "msg-1", requestId: "req-1"),
            assistantLine(
                input: 100, output: 90, timestamp: "2026-07-01T10:00:05.000Z",
                messageId: "msg-1", requestId: "req-1"),
        ]
        try lines.joined(separator: "\n").write(
            to: root.appendingPathComponent("s.jsonl"),
            atomically: true, encoding: .utf8)

        let scanner = VeyrSessionScanner(
            cacheFileURL: root.appendingPathComponent("cache.json"),
            projectsRoots: [root])
        let sessions = scanner.scan(tagInferrer: FeatureTagInferrer())

        let session = try #require(sessions.first)
        #expect(session.entryCount == 1)
        #expect(session.usage.outputTokens == 90)
    }

    @Test
    func `incremental rescan picks up appended lines without recounting`() throws {
        let root = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: root) }
        let file = root.appendingPathComponent("s.jsonl")

        try (assistantLine(input: 100, output: 50, timestamp: "2026-07-01T10:00:00.000Z") + "\n")
            .write(to: file, atomically: true, encoding: .utf8)

        let scanner = VeyrSessionScanner(
            cacheFileURL: root.appendingPathComponent("cache.json"),
            projectsRoots: [root])
        var sessions = scanner.scan(tagInferrer: FeatureTagInferrer())
        #expect(sessions.first?.usage.inputTokens == 100)

        // Append (and bump mtime past cache granularity).
        let handle = try FileHandle(forWritingTo: file)
        try handle.seekToEnd()
        try handle.write(contentsOf: Data(
            (assistantLine(input: 40, output: 20, timestamp: "2026-07-01T10:06:00.000Z") + "\n").utf8))
        try handle.close()
        try FileManager.default.setAttributes(
            [.modificationDate: Date().addingTimeInterval(5)], ofItemAtPath: file.path)

        sessions = scanner.scan(tagInferrer: FeatureTagInferrer())
        #expect(sessions.count == 1)
        #expect(sessions.first?.usage.inputTokens == 140)
        #expect(sessions.first?.entryCount == 2)
    }

    @Test
    func `sessions cache persists across scanner instances`() throws {
        let root = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: root) }
        try (assistantLine(input: 100, output: 50, timestamp: "2026-07-01T10:00:00.000Z") + "\n")
            .write(to: root.appendingPathComponent("s.jsonl"), atomically: true, encoding: .utf8)

        let cacheFile = root.appendingPathComponent("cache.json")
        _ = VeyrSessionScanner(cacheFileURL: cacheFile, projectsRoots: [root])
            .scan(tagInferrer: FeatureTagInferrer())
        #expect(FileManager.default.fileExists(atPath: cacheFile.path))

        let second = VeyrSessionScanner(cacheFileURL: cacheFile, projectsRoots: [root])
        let sessions = second.scan(tagInferrer: FeatureTagInferrer())
        #expect(sessions.count == 1)
        #expect(sessions.first?.usage.inputTokens == 100)
    }

    @Test
    func `daily aggregation groups by calendar day and tag`() {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let sessionA = SessionEntry(
            timestamp: today.addingTimeInterval(3600),
            startedAt: today,
            provider: "claude", modelId: "claude-sonnet-4", featureTag: "veyr",
            usage: TokenUsage(inputTokens: 10, outputTokens: 5, costUSD: 1.5))
        let sessionB = SessionEntry(
            timestamp: today.addingTimeInterval(7200),
            startedAt: today,
            provider: "claude", modelId: "claude-sonnet-4", featureTag: "sylo",
            usage: TokenUsage(inputTokens: 10, outputTokens: 5, costUSD: 0.5))

        let days = SessionSpendAggregator.dailySpend(sessions: [sessionA, sessionB], calendar: calendar)
        #expect(days.count == 1)
        #expect(days.first?.totalCostUSD == 2.0)
        #expect(days.first?.byFeatureTag["veyr"] == 1.5)
        #expect(days.first?.sessionCount == 2)
    }
}
