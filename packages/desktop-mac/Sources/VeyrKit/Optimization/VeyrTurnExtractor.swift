// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation

/// Incrementally extracts user→assistant turn pairs (with message text) from a
/// Claude Code session JSONL, starting at a byte offset. The cost scanner only
/// reads usage numbers; the classifier needs the actual text, so this is a
/// separate, offset-tracked reader that only ever parses new bytes.
public enum VeyrTurnExtractor {
    public struct Turn: Equatable, Sendable {
        public var userText: String
        public var assistantText: String
        public var model: String
        public var sessionId: String
        public var timestamp: Date
        public var inputTokens: Int
        public var outputTokens: Int
        public var cwd: String?
    }

    public struct ExtractionResult: Sendable {
        public var turns: [Turn]
        public var newOffset: UInt64
    }

    /// Newest session log across the Claude project roots (the "active" file).
    public static func newestSessionFile(
        roots: [URL] = VeyrSessionScanner.defaultProjectsRoots()) -> URL?
    {
        var newest: (url: URL, mtime: Date)?
        let fileManager = FileManager.default
        for root in roots {
            guard let enumerator = fileManager.enumerator(
                at: root,
                includingPropertiesForKeys: [.contentModificationDateKey],
                options: [.skipsHiddenFiles])
            else { continue }
            for case let url as URL in enumerator where url.pathExtension == "jsonl" {
                let mtime = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?
                    .contentModificationDate ?? .distantPast
                if newest == nil || mtime > newest!.mtime {
                    newest = (url, mtime)
                }
            }
        }
        return newest?.url
    }

    /// Reads new bytes from `offset` and pairs each assistant message with the
    /// most recent real user message (tool_result-only user entries are skipped).
    /// Offset 0 with a large existing file starts from EOF (never classify a
    /// giant backlog on first run) — pass `startAtEndIfNew: false` in tests.
    public static func extractNewTurns(
        from url: URL,
        offset: UInt64,
        startAtEndIfNew: Bool = true,
        maxTurns: Int = 10) -> ExtractionResult
    {
        guard let handle = try? FileHandle(forReadingFrom: url) else {
            return ExtractionResult(turns: [], newOffset: offset)
        }
        defer { try? handle.close() }
        let fileSize = (try? handle.seekToEnd()) ?? 0

        var start = offset
        if start == 0, startAtEndIfNew, fileSize > 0 {
            return ExtractionResult(turns: [], newOffset: fileSize)
        }
        if start > fileSize { start = 0 } // file rotated/truncated
        try? handle.seek(toOffset: start)
        guard let data = try? handle.readToEnd(), !data.isEmpty else {
            return ExtractionResult(turns: [], newOffset: fileSize)
        }

        // Only consume complete lines; leave a trailing partial line for next time.
        var consumable = data
        var consumedBytes = UInt64(data.count)
        if data.last != UInt8(ascii: "\n") {
            if let lastNewline = data.lastIndex(of: UInt8(ascii: "\n")) {
                consumable = data[data.startIndex...lastNewline]
                consumedBytes = UInt64(consumable.count)
            } else {
                return ExtractionResult(turns: [], newOffset: start)
            }
        }

        var turns: [Turn] = []
        var pendingUserText: String?
        var lastCwd: String?
        for lineData in consumable.split(separator: UInt8(ascii: "\n")) {
            guard let object = (try? JSONSerialization.jsonObject(with: Data(lineData)))
                as? [String: Any] else { continue }
            let type = object["type"] as? String
            if let cwd = object["cwd"] as? String, !cwd.isEmpty {
                lastCwd = cwd
            }
            if type == "user" {
                if let text = Self.messageText(object, role: "user"), !text.isEmpty {
                    pendingUserText = text
                }
            } else if type == "assistant" {
                guard let userText = pendingUserText,
                      let message = object["message"] as? [String: Any],
                      let assistantText = Self.messageText(object, role: "assistant"),
                      !assistantText.isEmpty
                else { continue }
                let usage = message["usage"] as? [String: Any]
                turns.append(Turn(
                    userText: userText,
                    assistantText: assistantText,
                    model: message["model"] as? String ?? "unknown",
                    sessionId: object["sessionId"] as? String ?? "",
                    timestamp: (object["timestamp"] as? String)
                        .flatMap(Self.parseTimestamp) ?? Date(),
                    inputTokens: usage?["input_tokens"] as? Int ?? 0,
                    outputTokens: usage?["output_tokens"] as? Int ?? 0,
                    cwd: lastCwd))
                pendingUserText = nil
                if turns.count >= maxTurns { break }
            }
        }
        return ExtractionResult(turns: turns, newOffset: start + consumedBytes)
    }

    /// Text content of a user/assistant entry; nil for tool_result-only entries.
    static func messageText(_ object: [String: Any], role: String) -> String? {
        guard let message = object["message"] as? [String: Any] else { return nil }
        if let text = message["content"] as? String { return text }
        guard let blocks = message["content"] as? [[String: Any]] else { return nil }
        let texts = blocks.compactMap { block -> String? in
            guard block["type"] as? String == "text" else { return nil }
            return block["text"] as? String
        }
        guard !texts.isEmpty else { return nil }
        return texts.joined(separator: "\n")
    }

    static func parseTimestamp(_ string: String) -> Date? {
        CostUsageScanner.dateFromTimestamp(string)
    }
}
