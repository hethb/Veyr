// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Pure ranking/lookup over an already-built VeyrPromptStyleStore — no I/O,
/// no graph grounding (phase 1). Kept separate from the HTTP-handling code
/// in VeyrDaemonServer so it's directly usable without a running daemon.
public enum VeyrPromptStyleCompleter {
    public struct Suggestion: Equatable {
        /// Continuation text to render as ghost text / insert after the
        /// caller's prefix — not the whole phrase, just what to append.
        public var text: String
        public var kind: String // "trigram" | "bigram" | "opener"
        public var confidence: Double // 0.0–1.0
    }

    /// `text` is the partial prompt typed so far. Empty/very short input
    /// (no complete trailing word) falls back to top openers, framed as
    /// "here's how you usually start a message like this." Otherwise, the
    /// last one or two complete words are used to look up a next-word
    /// continuation from the trigram/bigram corpus. Deliberately only
    /// matches complete trailing words (the caller hasn't finished typing
    /// the current word) — mid-word fuzzy matching is a phase-2+ concern.
    public static func complete(
        prefix: String, store: VeyrPromptStyleStore, max: Int = 3) -> [Suggestion]
    {
        let endsWithBoundary = prefix.last.map(\.isWhitespace) ?? true
        let words = VeyrPromptStyleExtractor.tokenize(prefix)

        guard !words.isEmpty, endsWithBoundary else {
            return Self.topOpeners(store: store, max: max)
        }

        if words.count >= 2 {
            let context = "\(words[words.count - 2]) \(words[words.count - 1])"
            let trigramMatches = Self.continuations(
                matching: context, in: store.trigrams, kind: "trigram", totalTurns: store.turnsObserved)
            if !trigramMatches.isEmpty { return Array(trigramMatches.prefix(max)) }
        }

        let context = words[words.count - 1]
        let bigramMatches = Self.continuations(
            matching: context, in: store.bigrams, kind: "bigram", totalTurns: store.turnsObserved)
        return Array(bigramMatches.prefix(max))
    }

    /// Finds n-gram entries whose leading words equal `context`, ranked by
    /// count, returning just the trailing word(s) as the completion text.
    private static func continuations(
        matching context: String,
        in ngrams: [String: Int],
        kind: String,
        totalTurns: Int) -> [Suggestion]
    {
        let prefix = context + " "
        let matches = ngrams.filter { $0.key.hasPrefix(prefix) && $0.key.count > prefix.count }
        return matches
            .sorted { $0.value > $1.value }
            .map { key, count in
                Suggestion(
                    text: String(key.dropFirst(prefix.count)),
                    kind: kind,
                    confidence: Self.confidence(count: count, totalTurns: totalTurns))
            }
    }

    private static func topOpeners(store: VeyrPromptStyleStore, max: Int) -> [Suggestion] {
        store.openers
            .sorted { $0.value > $1.value }
            .prefix(max)
            .map { key, count in
                Suggestion(text: key, kind: "opener", confidence: Self.confidence(count: count, totalTurns: store.turnsObserved))
            }
    }

    /// How often this pattern has appeared relative to total observed turns
    /// — a simple, interpretable relative-frequency measure, not a
    /// probability. Clamped since a phrase can recur more than once per turn.
    private static func confidence(count: Int, totalTurns: Int) -> Double {
        guard totalTurns > 0 else { return 0 }
        return min(1.0, Double(count) / Double(totalTurns))
    }
}
