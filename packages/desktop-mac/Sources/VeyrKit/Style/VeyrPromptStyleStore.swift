// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// `~/.veyr/cache/prompt-style.json` — a learned corpus of *derived* phrase
/// statistics from the user's own local prompt history, never raw prompt
/// text. This is a deliberate precedent shift from every other Veyr data
/// path (VeyrSessionScanner, VeyrTrainingData): those persist only
/// scalar/boolean features and explicitly never anything reconstructable
/// from prompt content. A style-completion model fundamentally needs
/// phrase-level statistics to be useful, so this store keeps weighted
/// n-grams/openers/task-shapes/referenced-token counts — still 100% local,
/// still never leaves the machine, and gated off by default
/// (`VeyrConfig.promptStyleLearning`).
///
/// Lives in cache/ (not top-level ~/.veyr/) because, like graph.json, it's
/// fully rebuildable by rescanning the local JSONL logs — wiping cache/
/// erases the persisted phrase corpus entirely.
public struct VeyrPromptStyleStore: Codable, Equatable, Sendable {
    /// Byte offset per scanned JSONL file path — mirrors VeyrSignalsStore.
    public var fileOffsets: [String: UInt64]
    public var turnsObserved: Int
    public var lastUpdated: Date
    public var lastDecayedAt: Date

    /// Two-word sequences, e.g. "fix the" -> 12.
    public var bigrams: [String: Int]
    /// Three-word sequences, e.g. "fix the bug" -> 5.
    public var trigrams: [String: Int]
    /// Normalized first ~6 words of a message, with file-like tokens
    /// replaced by the literal placeholder "<file>" so e.g. "fix the bug in
    /// foo.ts" and "...bar.ts" collapse into one reusable template instead
    /// of fragmenting the corpus per filename.
    public var openers: [String: Int]
    /// Coarse task-shape buckets, e.g. "fix_bug" -> 40, "add_feature" -> 25.
    public var taskShapes: [String: Int]
    /// File-like tokens referenced in prompts (extensions/paths).
    public var referencedFiles: [String: Int]
    /// Symbol-like tokens referenced in prompts (Pascal/camelCase words).
    public var referencedSymbols: [String: Int]

    public init(
        fileOffsets: [String: UInt64] = [:],
        turnsObserved: Int = 0,
        lastUpdated: Date = .distantPast,
        // Defaults to "now", not .distantPast: applyDecayIfDue() compares
        // against this, and .distantPast would make a brand-new store decay
        // immediately on its very first scan, before any counts even have a
        // chance to accumulate (a fresh count of 1 floors to 0 and vanishes).
        lastDecayedAt: Date = Date(),
        bigrams: [String: Int] = [:],
        trigrams: [String: Int] = [:],
        openers: [String: Int] = [:],
        taskShapes: [String: Int] = [:],
        referencedFiles: [String: Int] = [:],
        referencedSymbols: [String: Int] = [:])
    {
        self.fileOffsets = fileOffsets
        self.turnsObserved = turnsObserved
        self.lastUpdated = lastUpdated
        self.lastDecayedAt = lastDecayedAt
        self.bigrams = bigrams
        self.trigrams = trigrams
        self.openers = openers
        self.taskShapes = taskShapes
        self.referencedFiles = referencedFiles
        self.referencedSymbols = referencedSymbols
    }

    // MARK: - Anti-unbounded-growth: caps with hysteresis

    /// A map is trimmed to its cap once it exceeds `cap * trimHysteresis` —
    /// avoids re-sorting/trimming on every single scan call.
    public static let trimHysteresis = 1.2
    public static let bigramCap = 500
    public static let trigramCap = 300
    public static let openerCap = 100
    public static let referencedFileCap = 200
    public static let referencedSymbolCap = 200

    /// Decays every count by this factor once per `decayInterval`, then drops
    /// entries that round to zero — lets old one-off phrasing fade so the
    /// corpus tracks current style rather than accumulating forever.
    /// Graceful degradation, not a hard cutoff like VeyrSignalsStore.prune()'s
    /// 30-day deletion, since "style" should fade, not vanish at a boundary.
    public static let decayFactor = 0.9
    public static let decayInterval: TimeInterval = 24 * 60 * 60

    public mutating func applyDecayIfDue(now: Date = Date()) {
        guard now.timeIntervalSince(self.lastDecayedAt) > Self.decayInterval else { return }
        self.bigrams = Self.decayed(self.bigrams)
        self.trigrams = Self.decayed(self.trigrams)
        self.openers = Self.decayed(self.openers)
        self.taskShapes = Self.decayed(self.taskShapes)
        self.referencedFiles = Self.decayed(self.referencedFiles)
        self.referencedSymbols = Self.decayed(self.referencedSymbols)
        self.lastDecayedAt = now
    }

    private static func decayed(_ counts: [String: Int]) -> [String: Int] {
        counts.compactMapValues { count -> Int? in
            // Floor, not nearest-rounding: a count of 1 at 0.9x rounds to 0.9,
            // which nearest-rounding would send back up to 1 forever (0.9 is
            // closer to 1 than 0) — no one-off phrase would ever fade. Floor
            // means single mentions fade after one decay cycle while counts
            // built from repetition decay gradually, which is the intent.
            let decayed = Int((Double(count) * Self.decayFactor).rounded(.down))
            return decayed > 0 ? decayed : nil
        }
    }

    public mutating func trimIfNeeded() {
        self.bigrams = Self.trimmed(self.bigrams, cap: Self.bigramCap)
        self.trigrams = Self.trimmed(self.trigrams, cap: Self.trigramCap)
        self.openers = Self.trimmed(self.openers, cap: Self.openerCap)
        self.referencedFiles = Self.trimmed(self.referencedFiles, cap: Self.referencedFileCap)
        self.referencedSymbols = Self.trimmed(self.referencedSymbols, cap: Self.referencedSymbolCap)
        // taskShapes is an unbounded-but-tiny fixed vocabulary (see
        // VeyrPromptStyleExtractor.TaskShape) — no cap needed.
    }

    private static func trimmed(_ counts: [String: Int], cap: Int) -> [String: Int] {
        guard Double(counts.count) > Double(cap) * Self.trimHysteresis else { return counts }
        let kept = counts.sorted { $0.value > $1.value }.prefix(cap)
        return Dictionary(uniqueKeysWithValues: kept.map { ($0.key, $0.value) })
    }

    // MARK: - Persistence

    public static func fileURL(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        VeyrPaths.promptStyleStoreFile(base: base)
    }

    public static func load(from url: URL = Self.fileURL()) -> VeyrPromptStyleStore {
        guard let data = try? Data(contentsOf: url) else { return VeyrPromptStyleStore() }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return (try? decoder.decode(VeyrPromptStyleStore.self, from: data)) ?? VeyrPromptStyleStore()
    }

    public func save(to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(self).write(to: url, options: [.atomic])
    }
}
