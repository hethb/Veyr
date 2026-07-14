// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// One training sample per classified turn, collected locally so a future
/// model (or the heuristic tuner) can learn from real usage. Ground truth
/// (`userFeedbackComplexity`) stays nil until the user rates the session.
public struct VeyrTrainingSample: Codable, Equatable, Sendable {
    public var sessionId: String
    public var timestamp: Date
    public var userMessageLength: Int
    /// Not extractable from Claude Code JSONL (system prompt isn't logged); 0.
    public var systemPromptLength: Int
    public var fileExtensions: [String]
    public var hasCodeBlock: Bool
    public var fileCount: Int
    public var questionMark: Bool
    public var verbPrefix: String?
    public var llmClassification: String
    public var actualInputTokens: Int
    public var actualOutputTokens: Int
    public var modelUsed: String
    public var userFeedbackComplexity: String?

    static let fileExtensionPattern = #"\b[\w./-]+(\.(?:ts|tsx|js|jsx|py|swift|go|rs|java|rb|c|cpp|h|cs|json|md|sql|sh|yml|yaml))\b"#

    /// Extracts input features from a turn's user message.
    public static func from(
        sessionId: String,
        timestamp: Date,
        userText: String,
        llmClassification: String,
        modelUsed: String,
        inputTokens: Int,
        outputTokens: Int) -> VeyrTrainingSample
    {
        let trimmed = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        var extensions: [String] = []
        var fileCount = 0
        if let regex = try? NSRegularExpression(pattern: Self.fileExtensionPattern) {
            let matches = regex.matches(
                in: userText,
                range: NSRange(userText.startIndex..., in: userText))
            fileCount = matches.count
            for match in matches {
                guard let range = Range(match.range(at: 1), in: userText) else { continue }
                let ext = String(userText[range]).lowercased()
                if !extensions.contains(ext) { extensions.append(ext) }
            }
        }
        let firstWord = trimmed.split(separator: " ").first.map {
            String($0).lowercased().trimmingCharacters(in: .punctuationCharacters)
        }

        return VeyrTrainingSample(
            sessionId: sessionId,
            timestamp: timestamp,
            userMessageLength: userText.count,
            systemPromptLength: 0,
            fileExtensions: extensions,
            hasCodeBlock: userText.contains("```"),
            fileCount: fileCount,
            questionMark: trimmed.hasSuffix("?"),
            verbPrefix: firstWord?.isEmpty == false ? firstWord : nil,
            llmClassification: llmClassification,
            actualInputTokens: inputTokens,
            actualOutputTokens: outputTokens,
            modelUsed: modelUsed,
            userFeedbackComplexity: nil)
    }
}

/// Append-mostly JSONL store at `~/.veyr/ml/training-data.jsonl` — one JSON
/// object per line. Feedback updates rewrite the file (it stays small).
public enum VeyrTrainingDataStore {
    public static func fileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.home(base: base)
            .appendingPathComponent("ml", isDirectory: true)
            .appendingPathComponent("training-data.jsonl")
    }

    static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    public static func append(_ sample: VeyrTrainingSample, to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        var line = try Self.encoder().encode(sample)
        line.append(UInt8(ascii: "\n"))
        if let handle = try? FileHandle(forWritingTo: url) {
            defer { try? handle.close() }
            try handle.seekToEnd()
            try handle.write(contentsOf: line)
        } else {
            try line.write(to: url, options: [.atomic])
        }
    }

    public static func loadAll(from url: URL = Self.fileURL()) -> [VeyrTrainingSample] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return data.split(separator: UInt8(ascii: "\n")).compactMap {
            try? decoder.decode(VeyrTrainingSample.self, from: Data($0))
        }
    }

    /// Sets ground truth on every sample of a session. Returns updated count.
    @discardableResult
    public static func recordFeedback(
        sessionId: String,
        complexity: String,
        url: URL = Self.fileURL()) throws -> Int
    {
        var samples = Self.loadAll(from: url)
        var updated = 0
        for index in samples.indices where samples[index].sessionId == sessionId {
            samples[index].userFeedbackComplexity = complexity
            updated += 1
        }
        guard updated > 0 else { return 0 }
        let encoder = Self.encoder()
        var out = Data()
        for sample in samples {
            out.append(try encoder.encode(sample))
            out.append(UInt8(ascii: "\n"))
        }
        try out.write(to: url, options: [.atomic])
        return updated
    }

    public static func labeledCount(url: URL = Self.fileURL()) -> Int {
        Self.loadAll(from: url).count { $0.userFeedbackComplexity != nil }
    }
}
