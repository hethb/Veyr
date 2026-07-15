// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Pure per-turn extraction from a user prompt's text into derived,
/// abstracted statistics — never returns or retains the raw text itself.
/// Reuses the same techniques VeyrTrainingData.swift already established
/// (file-extension regex, first-word/verb-prefix extraction) rather than
/// inventing new ones.
public enum VeyrPromptStyleExtractor {
    public struct Extraction: Equatable {
        /// Deduped within this one message — a phrase repeated three times
        /// in one prompt should count once, not three times, toward the
        /// corpus (the scanner is the thing that accumulates across turns).
        public var bigrams: Set<String> = []
        public var trigrams: Set<String> = []
        public var opener: String?
        public var taskShape: String = "other"
        public var referencedFiles: Set<String> = []
        public var referencedSymbols: Set<String> = []

        public init(
            bigrams: Set<String> = [],
            trigrams: Set<String> = [],
            opener: String? = nil,
            taskShape: String = "other",
            referencedFiles: Set<String> = [],
            referencedSymbols: Set<String> = [])
        {
            self.bigrams = bigrams
            self.trigrams = trigrams
            self.opener = opener
            self.taskShape = taskShape
            self.referencedFiles = referencedFiles
            self.referencedSymbols = referencedSymbols
        }
    }

    /// Reuses VeyrTrainingSample.fileExtensionPattern verbatim (same
    /// extensions, same shape) so file-token detection stays consistent
    /// with the existing classifier's feature extraction.
    static let fileTokenPattern = #"\b[\w./-]+\.(?:ts|tsx|js|jsx|py|swift|go|rs|java|rb|c|cpp|h|cs|json|md|sql|sh|yml|yaml)\b"#
    /// Multi-hump identifiers: PascalCase or camelCase, at least two humps
    /// (e.g. "VeyrConfig", "fooBarBaz") — plain lowercase words don't match.
    static let symbolTokenPattern = #"\b[A-Za-z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+\b"#
    static let openerWordCount = 6

    private static let fixVerbs: Set<String> = ["fix", "debug", "resolve", "patch"]
    private static let addVerbs: Set<String> = ["add", "implement", "create", "build"]
    private static let refactorVerbs: Set<String> = ["refactor", "rename", "restructure", "simplify", "clean"]
    private static let reviewVerbs: Set<String> = ["review", "check", "audit"]
    private static let questionWords: Set<String> = [
        "what", "why", "how", "can", "could", "does", "is", "are", "should", "would",
    ]

    public static func extract(userText: String) -> Extraction {
        let trimmed = userText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return Extraction() }

        let words = Self.tokenize(trimmed)
        var result = Extraction()
        result.taskShape = Self.classifyTaskShape(trimmed: trimmed, words: words)
        result.referencedFiles = Self.matches(of: Self.fileTokenPattern, in: trimmed)
        result.referencedSymbols = Self.matches(of: Self.symbolTokenPattern, in: trimmed)
        result.opener = Self.opener(words: words, fileTokens: result.referencedFiles)

        guard words.count >= 2 else { return result }
        for i in 0..<(words.count - 1) {
            result.bigrams.insert("\(words[i]) \(words[i + 1])")
        }
        guard words.count >= 3 else { return result }
        for i in 0..<(words.count - 2) {
            result.trigrams.insert("\(words[i]) \(words[i + 1]) \(words[i + 2])")
        }
        return result
    }

    /// Lowercased words with surrounding punctuation stripped; empty tokens
    /// dropped. Deliberately simple — this feeds n-grams/openers, not a
    /// linguistic parser. Internal (not private): VeyrPromptStyleCompleter
    /// reuses this exact tokenization so completion lookups and the corpus
    /// they're matched against are tokenized identically.
    static func tokenize(_ text: String) -> [String] {
        text.split(whereSeparator: \.isWhitespace)
            .map { $0.trimmingCharacters(in: .punctuationCharacters).lowercased() }
            .filter { !$0.isEmpty }
    }

    private static func matches(of pattern: String, in text: String) -> Set<String> {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..., in: text)
        var found: Set<String> = []
        for match in regex.matches(in: text, range: range) {
            guard let matchRange = Range(match.range, in: text) else { continue }
            found.insert(String(text[matchRange]).lowercased())
        }
        return found
    }

    /// First ~6 normalized words, with file-like tokens collapsed to a
    /// literal "<file>" placeholder — this is what keeps "fix the bug in
    /// foo.ts" and "...bar.ts" collapsing into one reusable template instead
    /// of fragmenting the corpus per filename ever typed.
    private static func opener(words: [String], fileTokens: Set<String>) -> String? {
        guard !words.isEmpty else { return nil }
        let prefix = words.prefix(Self.openerWordCount).map { word -> String in
            fileTokens.contains(word) ? "<file>" : word
        }
        return prefix.joined(separator: " ")
    }

    private static func classifyTaskShape(trimmed: String, words: [String]) -> String {
        let lower = trimmed.lowercased()
        guard let firstWord = words.first else { return "other" }

        if lower.contains("test"), Self.addVerbs.contains(firstWord) || firstWord == "write" {
            return "write_tests"
        }
        if Self.fixVerbs.contains(firstWord) { return "fix_bug" }
        if Self.addVerbs.contains(firstWord) { return "add_feature" }
        if Self.refactorVerbs.contains(firstWord) { return "refactor" }
        if Self.reviewVerbs.contains(firstWord) { return "review" }
        if trimmed.hasSuffix("?") || Self.questionWords.contains(firstWord) { return "explain_question" }
        return "other"
    }
}
