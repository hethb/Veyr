// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation

// Veyr cost-layer smoke test. `swift test` needs Xcode's Testing/XCTest modules,
// which Command Line Tools lack, so this executable covers the same fixtures and
// then scans the real ~/.claude/projects logs. Run: swift run VeyrSmoke

var failures = 0

@MainActor
func check(_ condition: Bool, _ label: String) {
    if condition {
        print("  ok  \(label)")
    } else {
        failures += 1
        print("FAIL  \(label)")
    }
}

func assistantLine(
    model: String = "claude-sonnet-4-20250514",
    input: Int,
    output: Int,
    cacheRead: Int = 0,
    cacheWrite: Int = 0,
    timestamp: String,
    cwd: String = "/Users/heth/projects/veyr",
    messageId: String? = nil,
    requestId: String? = nil) -> String
{
    var message: [String: Any] = [
        "model": model,
        "usage": [
            "input_tokens": input,
            "output_tokens": output,
            "cache_read_input_tokens": cacheRead,
            "cache_creation_input_tokens": cacheWrite,
        ] as [String: Any],
    ]
    if let messageId { message["id"] = messageId }
    var obj: [String: Any] = [
        "type": "assistant",
        "timestamp": timestamp,
        "cwd": cwd,
        "sessionId": "sess-1",
        "message": message,
    ]
    if let requestId { obj["requestId"] = requestId }
    let data = try! JSONSerialization.data(withJSONObject: obj)
    return String(data: data, encoding: .utf8)!
}

// MARK: - 1. Pricing

print("— pricing —")
check(
    ModelPricing.cost(for: "claude-sonnet-4-20250514", inputTokens: 1_000_000, outputTokens: 1_000_000) == 18.0,
    "claude-sonnet-4 via upstream pricing = $18/M+M")
check(
    ModelPricing.cost(for: "gpt-4o-2024-08-06", inputTokens: 1_000_000, outputTokens: 1_000_000) == 12.5,
    "gpt-4o via static table = $12.50/M+M")
check(
    ModelPricing.cost(for: "gpt-4o-mini-2024-07-18", inputTokens: 1_000_000, outputTokens: 1_000_000) == 0.75,
    "gpt-4o-mini not shadowed by gpt-4o prefix")
check(
    ModelPricing.cost(for: "totally-new-model", inputTokens: 1_000_000, outputTokens: 1_000_000) == 10.0,
    "unknown model falls back to $2/$8")

// MARK: - 2. Feature tags

print("— feature tags —")
let inferrer = FeatureTagInferrer()
check(inferrer.inferTag(from: "/Users/someone/code/src/acme-app") == "acme-app", "generic components skipped")
check(inferrer.inferTag(from: nil) == "untagged", "nil path untagged")
let overridden = FeatureTagInferrer(overrides: ["/Users/x/projects/veyr": "veyr-core"])
check(overridden.inferTag(from: "/Users/x/projects/veyr/packages/cli") == "veyr-core", "override prefix match")

// MARK: - 3. Scanner fixtures

print("— scanner fixtures —")
let tempRoot = FileManager.default.temporaryDirectory
    .appendingPathComponent("veyr-smoke-\(UUID().uuidString)", isDirectory: true)
try! FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: tempRoot) }

let fixtureFile = tempRoot.appendingPathComponent("session-a.jsonl")
try! [
    assistantLine(input: 100, output: 50, timestamp: "2026-07-01T10:00:00.000Z"),
    assistantLine(input: 200, output: 80, cacheRead: 500, timestamp: "2026-07-01T10:05:00.000Z"),
    assistantLine(
        input: 999, output: 1, timestamp: "2026-07-01T10:06:00.000Z",
        messageId: "m1", requestId: "r1"),
    assistantLine(
        input: 999, output: 42, timestamp: "2026-07-01T10:06:05.000Z",
        messageId: "m1", requestId: "r1"),
    #"{"type":"user","message":{"content":"never read"}}"#,
].joined(separator: "\n").write(to: fixtureFile, atomically: true, encoding: .utf8)

let scanner = VeyrSessionScanner(
    cacheFileURL: tempRoot.appendingPathComponent("cache.json"),
    projectsRoots: [tempRoot])
let fixtureSessions = scanner.scan(tagInferrer: FeatureTagInferrer())
check(fixtureSessions.count == 1, "one file = one session")
if let session = fixtureSessions.first {
    check(session.usage.inputTokens == 100 + 200 + 999, "summed input tokens (chunks deduped)")
    check(session.usage.outputTokens == 50 + 80 + 42, "streaming chunk: last write wins")
    check(session.usage.cacheReadTokens == 500, "cache read tokens captured")
    check(session.entryCount == 3, "entry count after dedupe")
    check(session.featureTag == "veyr", "feature tag from cwd")
    check(session.usage.costUSD > 0, "cost computed")
    check(session.durationMinutes > 5.9 && session.durationMinutes < 6.1, "duration from first/last entry")
}

// Incremental append
let handle = try! FileHandle(forWritingTo: fixtureFile)
try! handle.seekToEnd()
try! handle.write(contentsOf: Data(
    ("\n" + assistantLine(input: 40, output: 20, timestamp: "2026-07-01T10:10:00.000Z")).utf8))
try! handle.close()
try! FileManager.default.setAttributes(
    [.modificationDate: Date().addingTimeInterval(5)], ofItemAtPath: fixtureFile.path)
let incremental = scanner.scan(tagInferrer: FeatureTagInferrer())
check(incremental.first?.usage.inputTokens == 100 + 200 + 999 + 40, "incremental append picked up")
check(incremental.first?.entryCount == 4, "entry count grew by one")

// MARK: - 4. Agent status feed

print("— agent status —")
let statusSessions = [
    SessionEntry(
        timestamp: Date(),
        startedAt: Date().addingTimeInterval(-600),
        provider: "claude", modelId: "claude-opus-4-8", featureTag: "veyr",
        usage: TokenUsage(inputTokens: 2000, outputTokens: 900, cacheReadTokens: 8000, costUSD: 2.50),
        projectPath: "/Users/heth/projects/veyr", entryCount: 10),
]
let controls = VeyrBudgetControls(
    globalMonthlyCapUSD: 50,
    perTag: ["veyr": .init(monthlyCapUSD: 3.0)])
let payload = VeyrAgentStatusBuilder.build(
    sessions: statusSessions,
    latestActivityAt: Date(),
    controls: controls)
check(payload.currentSession?.project == "veyr", "current session detected")
check(payload.currentSession?.isActive == true, "session marked active")
check(payload.budget.projectPctUsed == 83, "project budget pct (2.50/3.00 = 83%)")
check(payload.alerts.contains { $0.level == "warning" }, "80% budget alert raised")
check(
    payload.recommendations.contains { $0.action == "compact_context" },
    "runaway session triggers compact recommendation")
check(payload.agentInstructions.contains("/compact") || payload.agentInstructions.contains("compact"),
    "instructions mention compaction")

let statusBase = tempRoot
try! VeyrAgentStatusWriter.write(payload: payload, base: statusBase)
let statusFile = VeyrAgentStatusWriter.statusFileURL(base: statusBase)
let mdFile = VeyrAgentStatusWriter.markdownFileURL(base: statusBase)
check(FileManager.default.fileExists(atPath: statusFile.path), "VEYR_STATUS.json written")
check(FileManager.default.fileExists(atPath: mdFile.path), "VEYR_PROJECT_STATUS.md written")
if let data = try? Data(contentsOf: statusFile),
   let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
{
    check(obj["agent_instructions"] is String, "snake_case agent_instructions present")
    check((obj["current_session"] as? [String: Any])?["cost_per_minute"] is NSNumber,
        "snake_case cost_per_minute present")
} else {
    check(false, "status JSON parseable")
}

// CLAUDE.md injection round-trip
let projDir = tempRoot.appendingPathComponent("proj-claude-md", isDirectory: true)
try! FileManager.default.createDirectory(at: projDir, withIntermediateDirectories: true)
try! "# My project\n\nExisting notes.\n".write(
    to: projDir.appendingPathComponent("CLAUDE.md"), atomically: true, encoding: .utf8)
try! VeyrAgentStatusWriter.updateClaudeMd(projectPath: projDir.path, payload: payload)
var claudeMd = try! String(contentsOf: projDir.appendingPathComponent("CLAUDE.md"), encoding: .utf8)
check(claudeMd.contains("## Veyr spend status"), "CLAUDE.md section appended")
check(claudeMd.contains("Existing notes."), "existing CLAUDE.md content preserved")
try! VeyrAgentStatusWriter.updateClaudeMd(projectPath: projDir.path, payload: payload)
claudeMd = try! String(contentsOf: projDir.appendingPathComponent("CLAUDE.md"), encoding: .utf8)
check(claudeMd.components(separatedBy: "## Veyr spend status").count == 2,
    "second update replaces section, no duplicates")
try! VeyrAgentStatusWriter.removeClaudeMdSection(projectPath: projDir.path)
claudeMd = try! String(contentsOf: projDir.appendingPathComponent("CLAUDE.md"), encoding: .utf8)
check(!claudeMd.contains("Veyr spend status"), "section removable")
check(claudeMd.contains("Existing notes."), "content survives removal")

// MARK: - 5. Suggestion engine

print("— suggestion engine —")
func engineSession(
    tag: String, model: String = "claude-opus-4-8", cost: Double, input: Int, output: Int = 500,
    cacheRead: Int = 0, entries: Int = 5, daysAgo: Double = 1, hour: Double = 0) -> SessionEntry
{
    let ts = Date().addingTimeInterval(-daysAgo * 86400 + hour * 3600)
    return SessionEntry(
        timestamp: ts, startedAt: ts.addingTimeInterval(-300),
        provider: "claude", modelId: model, featureTag: tag,
        usage: TokenUsage(inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead, costUSD: cost),
        projectPath: "/Users/x/\(tag)", entryCount: entries)
}

// Rule 1: light frontier sessions (small fresh input AND small total context)
let lightSessions = (0..<6).map { i in
    engineSession(tag: "light", cost: 1.0, input: 1000, cacheRead: 2000, entries: 10, daysAgo: Double(i))
}
var engineOut = VeyrSuggestionEngine.analyze(sessions: lightSessions)
check(engineOut.contains { $0.action == .switchModel && $0.suggestedModel == "claude-haiku-4-5" },
    "rule 1 fires on light frontier sessions")
check(engineOut.first { $0.action == .switchModel }?.estimatedMonthlySavingsUSD == 6.0 * 0.8,
    "rule 1 savings = 80% of tag cost")

// Rule 1 cache-aware: same fresh input but huge cache reads → no false positive
let cachedSessions = (0..<6).map { i in
    engineSession(tag: "deep", cost: 1.0, input: 1000, cacheRead: 2_000_000, entries: 10, daysAgo: Double(i))
}
engineOut = VeyrSuggestionEngine.analyze(sessions: cachedSessions)
check(!engineOut.contains { $0.action == .switchModel },
    "rule 1 cache-aware: no false positive on heavily cached deep work")

// Rule 4: dominance
let domSessions = [engineSession(tag: "big", cost: 9.0, input: 9000)]
    + [engineSession(tag: "small", cost: 1.0, input: 9000)]
engineOut = VeyrSuggestionEngine.analyze(sessions: domSessions)
check(engineOut.contains { $0.action == .setBudgetCap && $0.id == "dominant-tag:big" },
    "rule 4 fires when one tag > 60%")

// Rule 3: runaway current session
let runaway = engineSession(tag: "hot", cost: 5.0, input: 9000, daysAgo: 0)
engineOut = VeyrSuggestionEngine.analyze(
    sessions: [runaway], currentSession: runaway, currentSessionIsActive: true)
check(engineOut.contains { $0.action == .compactContext }, "rule 3 fires on runaway active session")
engineOut = VeyrSuggestionEngine.analyze(
    sessions: [runaway], currentSession: runaway, currentSessionIsActive: false)
check(!engineOut.contains { $0.action == .compactContext }, "rule 3 silent when idle")

// Rule 1: no dominant model → silent
let splitSessions = (0..<3).map { i in
    engineSession(tag: "split", cost: 1.0, input: 1000, entries: 10, daysAgo: Double(i))
} + (0..<3).map { i in
    engineSession(tag: "split", model: "claude-haiku-4-5", cost: 1.0, input: 1000, entries: 10, daysAgo: Double(i), hour: 2)
}
engineOut = VeyrSuggestionEngine.analyze(sessions: splitSessions)
check(!engineOut.contains { $0.action == .switchModel }, "rule 1 silent without a dominant model")

// Rule 2: fires with recurring path, silent when scattered
let lowCache = (0..<21).map { i in
    engineSession(tag: "nocache", cost: 0.5, input: 10000, output: 200, cacheRead: 500, daysAgo: Double(i) * 0.5)
}
engineOut = VeyrSuggestionEngine.analyze(sessions: lowCache)
check(engineOut.contains { $0.action == .enableCaching }, "rule 2 fires on recurring low-cache path")

// Rule 6: >5 sessions/day on >3 days
let bursty = (1...4).flatMap { day in
    (0..<6).map { i in
        engineSession(tag: "bursty", cost: 0.2, input: 2000, daysAgo: Double(day), hour: Double(i))
    }
}
engineOut = VeyrSuggestionEngine.analyze(sessions: bursty)
check(engineOut.contains { $0.action == .useContextFile }, "rule 6 fires on 4 busy days")
let bursty3 = (1...3).flatMap { day in
    (0..<6).map { i in
        engineSession(tag: "bursty3", cost: 0.2, input: 2000, daysAgo: Double(day), hour: Double(i))
    }
}
engineOut = VeyrSuggestionEngine.analyze(sessions: bursty3)
check(!engineOut.contains { $0.action == .useContextFile }, "rule 6 silent on only 3 busy days")

// Quick win marking + sorting
let mixed = lightSessions + domSessions
engineOut = VeyrSuggestionEngine.analyze(sessions: mixed)
if let first = engineOut.first {
    check(first.isQuickWin && first.estimatedMonthlySavingsUSD > 0, "top non-zero suggestion is quick win")
}
check(engineOut.count <= 6, "capped at 6 suggestions")

// Engine suggestions flow into the agent feed
let feedPayload = VeyrAgentStatusBuilder.build(
    sessions: lightSessions,
    latestActivityAt: nil,
    controls: VeyrBudgetControls(),
    engineSuggestions: engineOut)
check(feedPayload.recommendations.contains { $0.action == "set_budget_cap" }
    || feedPayload.recommendations.contains { $0.action == "switch_model" },
    "engine suggestions merged into feed recommendations")

// MARK: - 6. Complexity classifier (offline pieces)

print("— complexity classifier —")
let reqBody = try! VeyrTaskComplexityClassifier.requestBody(
    userMessage: String(repeating: "x", count: 2000),
    assistantResponse: "done", model: "claude-opus-4-8")
let reqObj = try! JSONSerialization.jsonObject(with: reqBody) as! [String: Any]
check(reqObj["model"] as? String == "claude-haiku-4-5", "classifier always uses haiku")
let sysBlocks = reqObj["system"] as! [[String: Any]]
check((sysBlocks[0]["cache_control"] as? [String: String])?["type"] == "ephemeral",
    "system prompt carries cache_control ephemeral")

let fenced = "```json\n{\"complexity\":\"simple\",\"reasoning\":\"r\",\"suggestedModel\":\"claude-haiku-4-5\",\"estimatedTokensNeeded\":300}\n```"
let respData = try! JSONSerialization.data(withJSONObject: ["content": [["type": "text", "text": fenced]]])
let parsed = try! VeyrTaskComplexityClassifier.parseResponse(respData)
check(parsed.complexity == .simple, "fenced JSON response parsed")

let turnLog = tempRoot.appendingPathComponent("turns.jsonl")
try! """
{"type":"user","cwd":"/Users/x/proj","message":{"role":"user","content":"read main.swift"}}
{"type":"assistant","sessionId":"s1","timestamp":"2026-07-04T10:00:00Z","message":{"model":"claude-opus-4-8","content":[{"type":"text","text":"Here."}],"usage":{"input_tokens":100,"output_tokens":50}}}

""".write(to: turnLog, atomically: true, encoding: .utf8)
let extracted = VeyrTurnExtractor.extractNewTurns(from: turnLog, offset: 0, startAtEndIfNew: false)
check(extracted.turns.count == 1 && extracted.turns[0].cwd == "/Users/x/proj",
    "turn extractor pairs user/assistant with cwd")

let wasted = VeyrClassificationRecord.wastedCost(
    modelUsed: "claude-opus-4", modelRecommended: "claude-haiku-4",
    inputTokens: 1_000_000, outputTokens: 0)
check(abs(wasted - 14.20) < 0.01, "wasted cost = used minus recommended")

func classRecord(tag: String, complexity: String, wasted: Double) -> VeyrClassificationRecord {
    VeyrClassificationRecord(
        sessionId: "s", timestamp: Date(), featureTag: tag, complexity: complexity,
        modelUsed: "claude-opus-4-8", modelRecommended: "claude-haiku-4-5",
        estimatedTokensNeeded: 300, actualInputTokens: 1000, actualOutputTokens: 200,
        wastedCostUSD: wasted)
}
let mismatchRecords = (0..<4).map { _ in classRecord(tag: "veyr", complexity: "simple", wasted: 0.60) }
    + (0..<6).map { _ in classRecord(tag: "veyr", complexity: "complex", wasted: 0) }
engineOut = VeyrSuggestionEngine.analyze(sessions: [], classifications: mismatchRecords)
check(engineOut.contains { $0.id == "ai-mismatch:veyr" }, "rule 7 fires on AI-detected mismatch")
let lowWasteRecords = (0..<5).map { _ in classRecord(tag: "b", complexity: "simple", wasted: 0.10) }
    + (0..<5).map { _ in classRecord(tag: "b", complexity: "complex", wasted: 0) }
engineOut = VeyrSuggestionEngine.analyze(sessions: [], classifications: lowWasteRecords)
check(!engineOut.contains { $0.action == .switchModel }, "rule 7 silent under $2 wasted")

// MARK: - 4. Real logs

print("— real ~/.claude/projects scan —")
let realScanner = VeyrSessionScanner(
    cacheFileURL: tempRoot.appendingPathComponent("real-cache.json"))
let start = Date()
let real = realScanner.scan()
let elapsed = Date().timeIntervalSince(start)
let totalCost = real.reduce(0.0) { $0 + $1.usage.costUSD }
print(String(format: "  %d sessions, $%.2f all-time, scanned in %.1fs", real.count, totalCost, elapsed))

let tags = Dictionary(grouping: real, by: \.featureTag)
    .map { (tag: $0.key, cost: $0.value.reduce(0.0) { $0 + $1.usage.costUSD }, count: $0.value.count) }
    .sorted { $0.cost > $1.cost }
for entry in tags.prefix(8) {
    let tag = entry.tag.padding(toLength: 28, withPad: " ", startingAt: 0)
    print("  \(tag) " + String(format: "$%8.2f  %3d sessions", entry.cost, entry.count))
}
print("  most recent sessions:")
for session in real.prefix(5) {
    let df = DateFormatter()
    df.dateFormat = "MMM d HH:mm"
    let model = String(session.modelId.prefix(24)).padding(toLength: 24, withPad: " ", startingAt: 0)
    let tag = String(session.featureTag.prefix(18)).padding(toLength: 18, withPad: " ", startingAt: 0)
    let stats = String(
        format: "$%6.2f  %6d↓ %6d↑ cache %.0f%%",
        session.usage.costUSD,
        session.usage.inputTokens,
        session.usage.outputTokens,
        session.usage.cacheHitRate * 100)
    print("  \(df.string(from: session.timestamp))  \(model) \(tag) \(stats)")
}
check(!real.isEmpty, "real Claude Code sessions found")
check(real.allSatisfy { $0.usage.costUSD >= 0 }, "no negative costs")

print(failures == 0 ? "\nSMOKE PASSED" : "\nSMOKE FAILED (\(failures))")
exit(failures == 0 ? 0 : 1)
