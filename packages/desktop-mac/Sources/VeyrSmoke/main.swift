// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation
import VeyrKit

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

// MARK: - 4b. Agent guidance rules (editable rules file → CLAUDE.md section)

print("— guidance —")
let guidanceFile = tempRoot.appendingPathComponent("guidance-rules.json")
check(!FileManager.default.fileExists(atPath: guidanceFile.path), "guidance file absent before first load")
let seeded = VeyrGuidanceRules.load(from: guidanceFile)
check(FileManager.default.fileExists(atPath: guidanceFile.path), "guidance file seeded with defaults on first load")
check(seeded.rules.map(\.id) == ["no-unverified-claims", "no-full-restate-before-small-edit", "no-acknowledgment-padding"],
    "default rule set has the 3 starter rules")
check(seeded.rules.allSatisfy(\.enabled), "starter rules enabled by default")

let reloadedGuidance = VeyrGuidanceRules.load(from: guidanceFile)
check(reloadedGuidance == seeded, "second load reads the seeded file back unchanged (no code needed to iterate)")

let guidanceSection = VeyrGuidanceRules.claudeMdSection(seeded)
check(guidanceSection.contains("## Veyr agent guidance"), "guidance section has its own heading")
check(guidanceSection.contains("Don't state unverified claims as fact"), "unverified-claims rule rendered")
check(guidanceSection.contains("Don't restate full context before a small edit"), "restate-before-edit rule rendered")
check(guidanceSection.contains("Skip acknowledgment boilerplate"), "acknowledgment-padding rule rendered")

// Disabling a rule removes it from the rendered section without deleting it.
var edited = seeded
edited.rules[0].enabled = false
let editedSection = VeyrGuidanceRules.claudeMdSection(edited)
check(!editedSection.contains("Don't state unverified claims as fact"), "disabled rule dropped from section")
check(editedSection.contains("Skip acknowledgment boilerplate"), "other rules still render")

// CLAUDE.md round-trip: coexists with the spend section, independently added/removed.
try! "# My project\n\nExisting notes.\n".write(
    to: projDir.appendingPathComponent("CLAUDE.md"), atomically: true, encoding: .utf8)
try! VeyrAgentStatusWriter.updateClaudeMd(projectPath: projDir.path, payload: payload)
try! VeyrAgentStatusWriter.updateClaudeMdGuidanceSection(
    projectPath: projDir.path, section: guidanceSection)
claudeMd = try! String(contentsOf: projDir.appendingPathComponent("CLAUDE.md"), encoding: .utf8)
check(claudeMd.contains("## Veyr spend status") && claudeMd.contains("## Veyr agent guidance"),
    "spend and guidance sections coexist")
try! VeyrAgentStatusWriter.removeClaudeMdGuidanceSection(projectPath: projDir.path)
claudeMd = try! String(contentsOf: projDir.appendingPathComponent("CLAUDE.md"), encoding: .utf8)
check(!claudeMd.contains("Veyr agent guidance"), "guidance section independently removable")
check(claudeMd.contains("## Veyr spend status"), "spend section untouched by guidance removal")
check(claudeMd.contains("Existing notes."), "existing content survives guidance round-trip")

print("\n--- actual injected guidance block ---")
print(guidanceSection)
print("---")

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

// MARK: - 7. ML training data

print("— ml training data —")
let mlSample = VeyrTrainingSample.from(
    sessionId: "sess-1", timestamp: Date(),
    userText: "fix the bug in src/auth.ts and update tests/auth.test.ts please?",
    llmClassification: "moderate", modelUsed: "claude-opus-4-8",
    inputTokens: 500, outputTokens: 900)
check(mlSample.fileExtensions.contains(".ts"), "file extensions extracted")
check(mlSample.fileCount == 2, "file count = 2")
check(mlSample.questionMark, "question mark detected")
check(mlSample.verbPrefix == "fix", "verb prefix extracted")
check(!mlSample.hasCodeBlock, "no code block detected")

let mlFile = tempRoot.appendingPathComponent("ml/training-data.jsonl")
try! VeyrTrainingDataStore.append(mlSample, to: mlFile)
var second = mlSample
second.sessionId = "sess-2"
try! VeyrTrainingDataStore.append(second, to: mlFile)
check(VeyrTrainingDataStore.loadAll(from: mlFile).count == 2, "jsonl append + load roundtrip")
let updatedCount = try! VeyrTrainingDataStore.recordFeedback(
    sessionId: "sess-1", complexity: "complex", url: mlFile)
check(updatedCount == 1, "feedback updates only the matching session")
let reloaded = VeyrTrainingDataStore.loadAll(from: mlFile)
check(reloaded.first { $0.sessionId == "sess-1" }?.userFeedbackComplexity == "complex",
    "feedback persisted as ground truth")
check(reloaded.first { $0.sessionId == "sess-2" }?.userFeedbackComplexity == nil,
    "other sessions untouched")
check(VeyrTrainingDataStore.labeledCount(url: mlFile) == 1, "labeled count = 1")

// MARK: - 8. Signals scanner + rules 8-11

print("— session signals & part 7 rules —")
let sigLog = tempRoot.appendingPathComponent("signals.jsonl")
var sigLines: [String] = []
// 3 tool calls (2 unique) + a retry cluster (same user msg 3x in 5min + apology)
sigLines.append(#"{"type":"user","sessionId":"sig1","cwd":"/Users/x/veyr","timestamp":"2026-07-05T10:00:00Z","message":{"role":"user","content":"run the tests"}}"#)
sigLines.append(#"{"type":"assistant","sessionId":"sig1","timestamp":"2026-07-05T10:00:05Z","message":{"model":"claude-opus-4-8","content":[{"type":"tool_use","name":"Bash","input":{}},{"type":"tool_use","name":"Read","input":{}}]}}"#)
sigLines.append(#"{"type":"user","sessionId":"sig1","timestamp":"2026-07-05T10:01:00Z","message":{"role":"user","content":"fix the auth bug now"}}"#)
sigLines.append(#"{"type":"assistant","sessionId":"sig1","timestamp":"2026-07-05T10:01:10Z","message":{"model":"claude-opus-4-8","content":[{"type":"text","text":"I apologize, that failed."},{"type":"tool_use","name":"Bash","input":{}}]}}"#)
sigLines.append(#"{"type":"user","sessionId":"sig1","timestamp":"2026-07-05T10:02:00Z","message":{"role":"user","content":"fix the auth bug now"}}"#)
sigLines.append(#"{"type":"user","sessionId":"sig1","timestamp":"2026-07-05T10:03:00Z","message":{"role":"user","content":"fix the auth bug now"}}"#)
try! (sigLines.joined(separator: "\n") + "\n").write(to: sigLog, atomically: true, encoding: .utf8)

var sigStore = VeyrSignalsStore()
_ = VeyrSignalsScanner.parse(file: sigLog, offset: 0, into: &sigStore)
let sig1 = sigStore.sessions["sig1"]!
check(sig1.toolNames.sorted() == ["Bash", "Read"], "unique tool names collected")
check(sig1.toolUseCount == 3, "tool use count = 3")
check(sig1.retryClusters == 1, "retry cluster detected (3x same msg + apology)")
check(sig1.cwd == "/Users/x/veyr", "cwd captured in signals")

// Rule 8: 16 sessions using 2 of 10 distinct tools
func toolSignals(_ n: Int, tools: [String]) -> [VeyrSessionSignals] {
    (0..<n).map { i in
        VeyrSessionSignals(
            sessionId: "ts\(i)", cwd: "/Users/x/tools", lastTimestamp: Date(),
            toolNames: [tools[i % tools.count], tools[(i + 1) % tools.count]],
            toolUseCount: 4, messageCount: 10, retryClusters: 0)
    }
}
let tenTools = (0..<10).map { "tool_\($0)" }
let bloatSessions = (0..<16).map { i in
    SessionEntry(
        timestamp: Date().addingTimeInterval(Double(-i) * 3600),
        startedAt: Date().addingTimeInterval(Double(-i) * 3600 - 300),
        provider: "claude", modelId: "claude-opus-4-8", featureTag: "tools",
        usage: TokenUsage(inputTokens: 5000, outputTokens: 500, costUSD: 1.0),
        projectPath: "/Users/x/tools", sessionId: "ts\(i)", entryCount: 5)
}
engineOut = VeyrSuggestionEngine.analyze(
    sessions: bloatSessions, signals: toolSignals(16, tools: tenTools))
check(engineOut.contains { $0.action == .filterTools }, "rule 8 fires on tool bloat")
engineOut = VeyrSuggestionEngine.analyze(
    sessions: bloatSessions, signals: toolSignals(16, tools: tenTools), toolFilteringEnabled: false)
check(!engineOut.contains { $0.action == .filterTools }, "rule 8 respects the settings toggle")

// Rule 9: big fresh input, poor cache
let bloatedSystem = (0..<6).map { i in
    SessionEntry(
        timestamp: Date().addingTimeInterval(Double(-i) * 3600),
        startedAt: Date().addingTimeInterval(Double(-i) * 3600 - 300),
        provider: "claude", modelId: "claude-sonnet-5", featureTag: "bigsys",
        usage: TokenUsage(inputTokens: 10000, outputTokens: 800, cacheReadTokens: 1000, costUSD: 0.5),
        projectPath: "/Users/x/bigsys", entryCount: 10)
}
engineOut = VeyrSuggestionEngine.analyze(sessions: bloatedSystem)
check(engineOut.contains { $0.action == .trimSystemPrompt }, "rule 9 fires on bloated re-sent prefix")

// Rule 10: >5 retry clusters
let retrySignals = (0..<3).map { i in
    VeyrSessionSignals(
        sessionId: "rs\(i)", cwd: "/Users/x/retry", lastTimestamp: Date(),
        toolNames: ["Bash"], toolUseCount: 2, messageCount: 12, retryClusters: 3)
}
let retrySessions = (0..<3).map { i in
    SessionEntry(
        timestamp: Date(), startedAt: Date().addingTimeInterval(-300),
        provider: "claude", modelId: "claude-sonnet-5", featureTag: "retry",
        usage: TokenUsage(inputTokens: 3000, outputTokens: 800, costUSD: 2.0),
        projectPath: "/Users/x/retry", sessionId: "rs\(i)", entryCount: 5)
}
engineOut = VeyrSuggestionEngine.analyze(sessions: retrySessions, signals: retrySignals)
check(engineOut.contains { $0.action == .improveErrorHandling }, "rule 10 fires on retry clusters")

// Rule 11: long outputs + classifier says simple
let wasteSessions = (0..<11).map { i in
    SessionEntry(
        timestamp: Date().addingTimeInterval(Double(-i) * 3600),
        startedAt: Date().addingTimeInterval(Double(-i) * 3600 - 300),
        provider: "claude", modelId: "claude-opus-4-8", featureTag: "waste",
        usage: TokenUsage(inputTokens: 500, outputTokens: 2000, cacheReadTokens: 300000, costUSD: 1.0),
        projectPath: "/Users/x/waste", entryCount: 1)
}
let wasteClassifications = (0..<6).map { _ in
    classRecord(tag: "waste", complexity: "simple", wasted: 0.1)
} + (0..<4).map { _ in classRecord(tag: "waste", complexity: "complex", wasted: 0) }
engineOut = VeyrSuggestionEngine.analyze(
    sessions: wasteSessions, classifications: wasteClassifications)
check(engineOut.contains { $0.id == "output-waste:waste" }, "rule 11 fires (classifier-gated)")
engineOut = VeyrSuggestionEngine.analyze(sessions: wasteSessions)
check(!engineOut.contains { $0.id == "output-waste:waste" }, "rule 11 silent without classifier data")

// Vague tool names
let flagged = VeyrSignalsScanner.flagVagueTools(["do_thing", "process", "send_email", "run"])
check(flagged.count == 3 && !flagged.contains { $0.name == "send_email" },
    "vague tool names flagged, specific names pass")

// MARK: - 9. Prompt style model

print("— prompt style extractor —")
let fixExtraction = VeyrPromptStyleExtractor.extract(userText: "fix the bug in foo.ts")
check(fixExtraction.taskShape == "fix_bug", "verb-based task-shape classification")
check(fixExtraction.opener == "fix the bug in <file>", "file token collapsed to <file> placeholder in opener")
check(fixExtraction.referencedFiles.contains("foo.ts"), "file token captured")
check(fixExtraction.bigrams.contains("fix the"), "bigram extracted")
check(fixExtraction.trigrams.contains("fix the bug"), "trigram extracted")

let barExtraction = VeyrPromptStyleExtractor.extract(userText: "fix the bug in bar.ts")
check(barExtraction.opener == fixExtraction.opener,
    "different filenames collapse into the same opener template")

check(VeyrPromptStyleExtractor.extract(userText: "add tests for VeyrConfig").taskShape == "write_tests",
    "test-shaped 'add' beats the generic add_feature bucket")
check(VeyrPromptStyleExtractor.extract(userText: "add tests for VeyrConfig").referencedSymbols.contains("veyrconfig"),
    "camelCase/PascalCase symbol token captured")
check(VeyrPromptStyleExtractor.extract(userText: "why does this fail?").taskShape == "explain_question",
    "question-shaped prompt classified")
check(VeyrPromptStyleExtractor.extract(userText: "implement a new cache layer").taskShape == "add_feature",
    "generic add-verb falls into add_feature without 'test' in the text")
check(VeyrPromptStyleExtractor.extract(userText: "   ") == VeyrPromptStyleExtractor.Extraction(),
    "whitespace-only text extracts to nothing")

print("— prompt style scanner (incremental, offset-tracked) —")
// Isolated subdirectory: tempRoot already accumulates every other section's
// jsonl fixtures by this point, and scanning tempRoot itself would pick
// those up too (VeyrPromptStyleScanner walks the whole subtree).
let styleRoot = tempRoot.appendingPathComponent("style-only", isDirectory: true)
try! FileManager.default.createDirectory(at: styleRoot, withIntermediateDirectories: true)
let styleLog = styleRoot.appendingPathComponent("style-session.jsonl")
func styleUserLine(_ text: String, ts: String) -> String {
    let obj: [String: Any] = [
        "type": "user", "sessionId": "style1", "cwd": "/Users/x/styleproj",
        "timestamp": ts, "message": ["role": "user", "content": text],
    ]
    return String(data: try! JSONSerialization.data(withJSONObject: obj), encoding: .utf8)!
}
func styleAssistantLine(ts: String) -> String {
    let obj: [String: Any] = [
        "type": "assistant", "sessionId": "style1", "cwd": "/Users/x/styleproj", "timestamp": ts,
        "message": [
            "model": "claude-sonnet-5",
            "content": [["type": "text", "text": "Done."]],
            "usage": ["input_tokens": 10, "output_tokens": 5],
        ],
    ]
    return String(data: try! JSONSerialization.data(withJSONObject: obj), encoding: .utf8)!
}
try! [
    styleUserLine("fix the bug in foo.ts", ts: "2026-07-15T10:00:00.000Z"),
    styleAssistantLine(ts: "2026-07-15T10:00:05.000Z"),
    styleUserLine("fix the bug in bar.ts", ts: "2026-07-15T10:01:00.000Z"),
    styleAssistantLine(ts: "2026-07-15T10:01:05.000Z"),
    styleUserLine("add tests for VeyrConfig", ts: "2026-07-15T10:02:00.000Z"),
    styleAssistantLine(ts: "2026-07-15T10:02:05.000Z"),
    styleUserLine("why does this fail?", ts: "2026-07-15T10:03:00.000Z"),
    styleAssistantLine(ts: "2026-07-15T10:03:05.000Z"),
].joined(separator: "\n").appending("\n").write(to: styleLog, atomically: true, encoding: .utf8)

let styleStoreURL = tempRoot.appendingPathComponent("prompt-style.json")
let styleStore = VeyrPromptStyleScanner.scan(roots: [styleRoot], storeURL: styleStoreURL)
check(styleStore.turnsObserved == 4, "4 user turns ingested from fixture")
check(styleStore.openers["fix the bug in <file>"] == 2, "two filenames collapsed into one opener, counted twice")
check(styleStore.taskShapes["fix_bug"] == 2, "two fix_bug turns")
check(styleStore.taskShapes["write_tests"] == 1, "one write_tests turn")
check(styleStore.taskShapes["explain_question"] == 1, "one explain_question turn")
check(styleStore.referencedFiles["foo.ts"] == 1 && styleStore.referencedFiles["bar.ts"] == 1,
    "both distinct filenames tracked separately in referencedFiles")
// Not comparing against styleLog.path directly: /var is a symlink to
// /private/var on macOS, and the enumerator's resolved URLs differ textually
// from a path built via appendingPathComponent, even though they're the same
// file (same behavior VeyrSignalsScanner already has — not specific to this
// scanner). Checking non-emptiness is the meaningful assertion here.
check(!styleStore.fileOffsets.isEmpty, "offset recorded for the scanned file")

let noOpRescan = VeyrPromptStyleScanner.scan(
    roots: [styleRoot], store: styleStore, storeURL: styleStoreURL)
check(noOpRescan.turnsObserved == styleStore.turnsObserved, "re-scan with no new bytes is a no-op")

let styleHandle = try! FileHandle(forWritingTo: styleLog)
try! styleHandle.seekToEnd()
try! styleHandle.write(contentsOf: Data(
    (styleUserLine("refactor the auth module", ts: "2026-07-15T10:04:00.000Z") +
        "\n" + styleAssistantLine(ts: "2026-07-15T10:04:05.000Z") + "\n").utf8))
try! styleHandle.close()
try! FileManager.default.setAttributes(
    [.modificationDate: Date().addingTimeInterval(5)], ofItemAtPath: styleLog.path)
let appendedStore = VeyrPromptStyleScanner.scan(
    roots: [styleRoot], store: noOpRescan, storeURL: styleStoreURL)
check(appendedStore.turnsObserved == 5, "incremental append picked up exactly one new turn")
check(appendedStore.taskShapes["refactor"] == 1, "new turn classified and folded into existing counts")

var capStore = VeyrPromptStyleStore()
for i in 0..<700 { capStore.bigrams["word\(i) token"] = 1 }
capStore.trimIfNeeded()
check(capStore.bigrams.count == VeyrPromptStyleStore.bigramCap, "bigram map trimmed down to its cap")

var decayStore = VeyrPromptStyleStore(lastDecayedAt: Date().addingTimeInterval(-25 * 60 * 60))
decayStore.bigrams = ["fix the": 10, "add a": 1]
decayStore.applyDecayIfDue()
check(decayStore.bigrams["fix the"] == 9, "count decayed by 0.9x after 24h")
check(decayStore.bigrams["add a"] == nil, "count rounding to zero is dropped entirely")

var freshDecayStore = VeyrPromptStyleStore(lastDecayedAt: Date())
freshDecayStore.bigrams = ["fix the": 10]
freshDecayStore.applyDecayIfDue()
check(freshDecayStore.bigrams["fix the"] == 10, "no decay applied before the 24h interval elapses")

// MARK: - 10. Savings tracker

print("— savings calculator (pure) —")
check(VeyrSavingsCalculator.tier(fileCount: 10) == "small", "tier boundary: <50 is small")
check(VeyrSavingsCalculator.tier(fileCount: 50) == "medium", "tier boundary: 50 is medium (inclusive)")
check(VeyrSavingsCalculator.tier(fileCount: 199) == "medium", "tier boundary: 199 is still medium")
check(VeyrSavingsCalculator.tier(fileCount: 200) == "large", "tier boundary: 200 is large (inclusive)")

let redundant = VeyrSavingsCalculator.redundantReadTokens(readCounts: ["a.ts": 3, "b.ts": 1, "c.ts": 2])
check(redundant == 3 * VeyrSavingsCalculator.tokensPerFileRead,
    "redundant reads: (3-1)+(1-1)+(2-1) = 3 redundant reads, never negative per-file")

let belowGateBaseline = VeyrSavingsStore.TierBaseline(sumReads: 40, sessionCount: 4)
let belowGateEstimate = VeyrSavingsCalculator.graphExplorationSavings(
    fileCount: 10, sessionReadFilesCount: 2, baseline: belowGateBaseline, modelId: "claude-sonnet-5")
check(belowGateEstimate.tier == .assumption, "below the 5-session gate falls back to the assumption tier")
check(belowGateEstimate.tokens == Double(VeyrGraphContextBuilder.exploreTokens(fileCount: 10) - 400),
    "assumption tier reuses the existing exploreTokens heuristic exactly")

let atGateBaseline = VeyrSavingsStore.TierBaseline(sumReads: 50, sessionCount: 5)
let atGateEstimate = VeyrSavingsCalculator.graphExplorationSavings(
    fileCount: 10, sessionReadFilesCount: 3, baseline: atGateBaseline, modelId: "claude-sonnet-5")
check(atGateEstimate.tier == .measured, "at the 5-session gate, uses the measured personal baseline")
check(atGateEstimate.tokens == (10.0 - 3.0) * VeyrSavingsCalculator.tokensPerFileRead,
    "measured tier: (baseline mean 10 - actual 3) * 500")

check(
    VeyrSavingsCalculator.guidanceVerbositySavings(
        guidanceOn: .init(sumOutputTokens: 1000, turnCount: 10),
        guidanceOff: .init(sumOutputTokens: 3000, turnCount: 30),
        sessionEntryCount: 5, modelId: "claude-sonnet-5") == nil,
    "component 3 below the 20-turn gate on the ON side returns nil, not zero")
if let guidanceEstimate = VeyrSavingsCalculator.guidanceVerbositySavings(
    guidanceOn: .init(sumOutputTokens: 2000, turnCount: 20),
    guidanceOff: .init(sumOutputTokens: 6000, turnCount: 20),
    sessionEntryCount: 4, modelId: "claude-sonnet-5")
{
    check(guidanceEstimate.tier == .correlational, "component 3 tagged correlational")
    check(guidanceEstimate.tokens == (300.0 - 100.0) * 4.0,
        "component 3: (off mean 300 - on mean 100) * this session's entryCount")
} else {
    check(false, "component 3 should produce an estimate once both populations meet the gate")
}

print("— savings tracker (revision-aware folding) —")
func savingsSession(
    id: String, tag: String, outputTokens: Int, entryCount: Int,
    model: String = "claude-sonnet-5") -> SessionEntry
{
    SessionEntry(
        timestamp: Date(), startedAt: Date().addingTimeInterval(-300),
        provider: "claude", modelId: model, featureTag: tag,
        usage: TokenUsage(inputTokens: 500, outputTokens: outputTokens, costUSD: 1),
        projectPath: "/Users/x/\(tag)", sessionId: id, entryCount: entryCount)
}

// No-graph session ticked 3 times: sessionCount must stay 1 (a revision, not
// 3 new samples), and the baseline reflects only the LATEST read count.
var revStore = VeyrSavingsStore()
let sess1 = savingsSession(id: "rev1", tag: "proj1", outputTokens: 500, entryCount: 5)
VeyrSavingsTracker.fold(
    session: sess1, signals: VeyrSessionSignals(sessionId: "rev1", readFiles: ["a.ts", "b.ts"]),
    graphFileCount: nil, guidanceOn: false, into: &revStore)
check(revStore.graphTierBaselines["small"] == nil, "no tier known yet — this project has never had a graph")

// A DIFFERENT session in the same project builds a graph first (caches the tier)...
let sess0 = savingsSession(id: "rev0", tag: "proj1", outputTokens: 500, entryCount: 5)
VeyrSavingsTracker.fold(
    session: sess0, signals: VeyrSessionSignals(sessionId: "rev0", readFiles: ["z.ts"]),
    graphFileCount: 10, guidanceOn: false, into: &revStore)
check(revStore.projectTiers["proj1"] == "small", "project tier cached once any graph is seen for it")

// ...now re-observe sess1 (still no live graph this tick) 3 times with a growing read count.
for readFiles in [["a.ts", "b.ts"], ["a.ts", "b.ts", "c.ts"], ["a.ts", "b.ts", "c.ts", "d.ts"]] {
    VeyrSavingsTracker.fold(
        session: sess1, signals: VeyrSessionSignals(sessionId: "rev1", readFiles: readFiles),
        graphFileCount: nil, guidanceOn: false, into: &revStore)
}
check(revStore.graphTierBaselines["small"]?.sessionCount == 1,
    "3 repeated ticks of the SAME session fold as 1 sample, not 3 (revision-aware)")
check(revStore.graphTierBaselines["small"]?.sumReads == 4,
    "baseline reflects only the LATEST read count (4), not the sum across ticks")

print("— savings tracker (sticky-graph transition retracts baseline contribution) —")
var transStore = VeyrSavingsStore()
// Seed a project tier via one graph-active session elsewhere.
VeyrSavingsTracker.fold(
    session: savingsSession(id: "seed", tag: "proj2", outputTokens: 100, entryCount: 1),
    signals: VeyrSessionSignals(sessionId: "seed", readFiles: []),
    graphFileCount: 10, guidanceOn: false, into: &transStore)
let transSession = savingsSession(id: "trans1", tag: "proj2", outputTokens: 500, entryCount: 5)
// Starts with no live graph — folds into the no-graph baseline.
VeyrSavingsTracker.fold(
    session: transSession, signals: VeyrSessionSignals(sessionId: "trans1", readFiles: ["a.ts", "b.ts", "c.ts"]),
    graphFileCount: nil, guidanceOn: false, into: &transStore)
let baselineCountBefore = transStore.graphTierBaselines["small"]?.sessionCount ?? 0
// Graph becomes active mid-session — must retract the earlier baseline contribution.
VeyrSavingsTracker.fold(
    session: transSession, signals: VeyrSessionSignals(sessionId: "trans1", readFiles: ["a.ts", "b.ts", "c.ts"]),
    graphFileCount: 10, guidanceOn: false, into: &transStore)
check((transStore.graphTierBaselines["small"]?.sessionCount ?? -1) == baselineCountBefore - 1,
    "mid-session graph activation retracts the session's earlier no-graph baseline contribution")

print()

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

// MARK: - 5. Daemon /sessions wire shape

// The CLI (packages/cli/src/veyr/sessions.ts) decodes the daemon's GET
// /sessions body by these exact camelCase keys + ISO-8601 dates. Guard the
// encoding here so a SessionEntry/encoder change can't silently break it.
print("\n— daemon /sessions encoding —")
if let sample = real.first {
    let encoder = JSONEncoder()
    encoder.dateEncodingStrategy = .iso8601
    struct SessionsResponse: Encodable { var sessions: [SessionEntry] }
    let data = (try? encoder.encode(SessionsResponse(sessions: [sample]))) ?? Data()
    let decoded = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    let row = (decoded?["sessions"] as? [[String: Any]])?.first
    check(row != nil, "sessions array encodes")
    for key in ["timestamp", "startedAt", "provider", "modelId", "featureTag", "usage", "entryCount"] {
        check(row?[key] != nil, "row has \(key)")
    }
    let usage = row?["usage"] as? [String: Any]
    for key in ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "costUSD"] {
        check(usage?[key] != nil, "usage has \(key)")
    }
    let timestamp = row?["timestamp"] as? String ?? ""
    check(timestamp.contains("T"), "timestamp is ISO-8601 (\(timestamp))")
}

print(failures == 0 ? "\nSMOKE PASSED" : "\nSMOKE FAILED (\(failures))")
exit(failures == 0 ? 0 : 1)
