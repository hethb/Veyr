// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Per-session behavioral signals for suggestion rules 8–10: which tools the
/// agent actually called, retry clusters, and conversation length. Extracted
/// incrementally from session JSONLs (offset-tracked like the classifier, but
/// parses the full backlog on first sight — it's CPU-only, no API cost).
///
/// Data honesty: Claude Code logs record tool *calls*, not the tool list that
/// was loaded, and never the system prompt text. Everything here is derived
/// from calls only.
public struct VeyrSessionSignals: Codable, Equatable, Sendable {
    public var sessionId: String
    public var cwd: String?
    public var lastTimestamp: Date
    public var toolNames: [String]
    public var toolUseCount: Int
    public var messageCount: Int
    public var retryClusters: Int
    /// Distinct file paths passed to Read tool calls (graph rule G4). Optional so
    /// stores persisted before this field decode unchanged; capped per session.
    public var readFiles: [String]?

    public init(
        sessionId: String,
        cwd: String? = nil,
        lastTimestamp: Date = Date(),
        toolNames: [String] = [],
        toolUseCount: Int = 0,
        messageCount: Int = 0,
        retryClusters: Int = 0,
        readFiles: [String]? = nil)
    {
        self.sessionId = sessionId
        self.cwd = cwd
        self.lastTimestamp = lastTimestamp
        self.toolNames = toolNames
        self.toolUseCount = toolUseCount
        self.messageCount = messageCount
        self.retryClusters = retryClusters
        self.readFiles = readFiles
    }
}

public struct VeyrSignalsStore: Codable, Sendable {
    public var fileOffsets: [String: UInt64]
    public var sessions: [String: VeyrSessionSignals]

    public init(fileOffsets: [String: UInt64] = [:], sessions: [String: VeyrSessionSignals] = [:]) {
        self.fileOffsets = fileOffsets
        self.sessions = sessions
    }

    public static func fileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.cacheDirectory(base: base).appendingPathComponent("session-signals.json")
    }

    public static func load(from url: URL = Self.fileURL()) -> VeyrSignalsStore {
        guard let data = try? Data(contentsOf: url) else { return VeyrSignalsStore() }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(VeyrSignalsStore.self, from: data)) ?? VeyrSignalsStore()
    }

    public func save(to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(self).write(to: url, options: [.atomic])
    }

    public mutating func prune(now: Date = Date()) {
        guard let cutoff = Calendar.current.date(byAdding: .day, value: -30, to: now) else { return }
        self.sessions = self.sessions.filter { $0.value.lastTimestamp >= cutoff }
    }
}

public enum VeyrSignalsScanner {
    static let retryWindowSeconds: TimeInterval = 300
    static let apologyMarkers = ["i apologize", "i'm sorry", "sorry,"]
    /// Claude Code's file-read tools across log format versions.
    static let readToolNames: Set<String> = ["Read", "read_file", "NotebookRead"]
    static let maxReadFilesPerSession = 300

    /// Scans changed files under the Claude roots and returns updated signals.
    public static func scan(
        roots: [URL] = VeyrSessionScanner.defaultProjectsRoots(),
        store initial: VeyrSignalsStore? = nil,
        storeURL: URL = VeyrSignalsStore.fileURL()) -> VeyrSignalsStore
    {
        var store = initial ?? VeyrSignalsStore.load(from: storeURL)
        let fileManager = FileManager.default
        for root in roots {
            guard let enumerator = fileManager.enumerator(
                at: root, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles])
            else { continue }
            for case let url as URL in enumerator where url.pathExtension == "jsonl" {
                let size = UInt64((try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
                let offset = store.fileOffsets[url.path] ?? 0
                guard size > offset else { continue }
                let newOffset = Self.parse(file: url, offset: offset > size ? 0 : offset, into: &store)
                store.fileOffsets[url.path] = newOffset
            }
        }
        store.prune()
        try? store.save(to: storeURL)
        return store
    }

    /// Parses new bytes of one file into the store; returns the new offset.
    public static func parse(file: URL, offset: UInt64, into store: inout VeyrSignalsStore) -> UInt64 {
        guard let handle = try? FileHandle(forReadingFrom: file) else { return offset }
        defer { try? handle.close() }
        let fileSize = (try? handle.seekToEnd()) ?? 0
        guard fileSize > offset else { return fileSize }
        try? handle.seek(toOffset: offset)
        guard let data = try? handle.readToEnd(), !data.isEmpty else { return fileSize }

        var consumable = data
        var consumed = UInt64(data.count)
        if data.last != UInt8(ascii: "\n") {
            guard let lastNewline = data.lastIndex(of: UInt8(ascii: "\n")) else { return offset }
            consumable = data[data.startIndex...lastNewline]
            consumed = UInt64(consumable.count)
        }

        // Retry detection state (per parse run; clusters split across runs are
        // an accepted imprecision).
        var recentUserTexts: [(norm: String, at: Date)] = []
        var openClusterNorm: String?
        var apologySeen = false

        for line in consumable.split(separator: UInt8(ascii: "\n")) {
            guard let object = (try? JSONSerialization.jsonObject(with: Data(line))) as? [String: Any],
                  let type = object["type"] as? String,
                  type == "user" || type == "assistant"
            else { continue }

            let sessionId = object["sessionId"] as? String ?? file.lastPathComponent
            let timestamp = (object["timestamp"] as? String)
                .flatMap(CostUsageScanner.dateFromTimestamp) ?? Date()
            var signals = store.sessions[sessionId] ?? VeyrSessionSignals(sessionId: sessionId)
            signals.lastTimestamp = max(signals.lastTimestamp, timestamp)
            if let cwd = object["cwd"] as? String, !cwd.isEmpty { signals.cwd = cwd }
            signals.messageCount += 1

            if type == "assistant", let message = object["message"] as? [String: Any] {
                if let blocks = message["content"] as? [[String: Any]] {
                    for block in blocks {
                        if block["type"] as? String == "tool_use",
                           let name = block["name"] as? String
                        {
                            signals.toolUseCount += 1
                            if !signals.toolNames.contains(name) { signals.toolNames.append(name) }
                            if Self.readToolNames.contains(name),
                               let input = block["input"] as? [String: Any],
                               let path = input["file_path"] as? String, !path.isEmpty
                            {
                                var reads = signals.readFiles ?? []
                                if reads.count < Self.maxReadFilesPerSession, !reads.contains(path) {
                                    reads.append(path)
                                    signals.readFiles = reads
                                }
                            }
                        }
                        if block["type"] as? String == "text",
                           let text = (block["text"] as? String)?.lowercased(),
                           Self.apologyMarkers.contains(where: text.contains)
                        {
                            apologySeen = true
                        }
                    }
                }
            } else if type == "user",
                      let text = VeyrTurnExtractor.messageText(object, role: "user")
            {
                let norm = Self.normalize(text)
                if !norm.isEmpty {
                    recentUserTexts.removeAll { timestamp.timeIntervalSince($0.at) > Self.retryWindowSeconds }
                    let repeats = recentUserTexts.count { $0.norm == norm }
                    // ">2 times within 5 minutes" with an error/apology marker.
                    if repeats >= 2, apologySeen, openClusterNorm != norm {
                        signals.retryClusters += 1
                        openClusterNorm = norm
                        apologySeen = false
                    }
                    recentUserTexts.append((norm, timestamp))
                }
            }
            store.sessions[sessionId] = signals
        }
        return offset + consumed
    }

    static func normalize(_ text: String) -> String {
        String(text.lowercased()
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
            .prefix(120))
    }

    // MARK: - Tool name quality (vague names only — descriptions aren't logged)

    public static let vagueNamePattern =
        #"^(do|process|handle|manage|run)(_.*)?$"#

    /// Claude Code's built-in tools — short names by design, not fixable by
    /// the user, so never flagged.
    static let builtinToolAllowlist: Set<String> = [
        "Bash", "Read", "Edit", "Write", "Grep", "Glob", "Task", "TodoWrite",
        "TodoRead", "WebFetch", "WebSearch", "NotebookEdit", "NotebookRead",
        "MultiEdit", "LS", "Agent", "Skill", "KillShell", "BashOutput",
    ]

    public static func flagVagueTools(_ names: [String]) -> [(name: String, issue: String, suggestion: String)] {
        names.compactMap { name in
            if Self.builtinToolAllowlist.contains(name) { return nil }
            if name.count < 5 {
                return (name, "short_name",
                        "Rename to describe what it does (e.g. 'send_email', 'create_task')")
            }
            if name.lowercased().range(of: Self.vagueNamePattern, options: .regularExpression) != nil {
                return (name, "vague_name",
                        "Rename to describe what it does (e.g. 'send_email', 'create_task')")
            }
            return nil
        }
    }
}
