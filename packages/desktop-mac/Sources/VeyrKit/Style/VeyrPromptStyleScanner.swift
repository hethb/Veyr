// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation

/// Incrementally builds VeyrPromptStyleStore from local Claude Code JSONL
/// logs, mirroring VeyrSignalsScanner's offset-tracked shape. Built on the
/// existing VeyrTurnExtractor — this does not parse JSONL itself.
public enum VeyrPromptStyleScanner {
    /// Passed to VeyrTurnExtractor.extractNewTurns to work around a latent
    /// issue there: `newOffset` is computed from the *entire* consumed byte
    /// range regardless of where a `maxTurns` break happens inside it
    /// (VeyrTurnExtractor.swift's `turns.count >= maxTurns` break still
    /// returns `newOffset: start + consumedBytes` for the whole chunk). The
    /// default `maxTurns: 10` would silently skip-and-never-retry turns past
    /// the 10th on a large first scan. A very large cap sidesteps this
    /// without touching the shared extractor (also used by the complexity
    /// classifier, out of scope for this feature to change).
    static let maxTurnsPerFile = 1_000_000

    /// Scans changed files under the Claude roots and returns the updated
    /// store. Unlike the LLM classifier (which skips backlog on first sight
    /// to avoid API cost), this is CPU-only and backfills full history on
    /// first run — the whole point is learning from existing history.
    @discardableResult
    public static func scan(
        roots: [URL] = VeyrSessionScanner.defaultProjectsRoots(),
        store initial: VeyrPromptStyleStore? = nil,
        storeURL: URL = VeyrPromptStyleStore.fileURL(),
        now: Date = Date()) -> VeyrPromptStyleStore
    {
        var store = initial ?? VeyrPromptStyleStore.load(from: storeURL)
        let fileManager = FileManager.default
        for root in roots {
            guard let enumerator = fileManager.enumerator(
                at: root, includingPropertiesForKeys: [.fileSizeKey], options: [.skipsHiddenFiles])
            else { continue }
            for case let url as URL in enumerator where url.pathExtension == "jsonl" {
                let size = UInt64((try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
                let offset = store.fileOffsets[url.path] ?? 0
                guard size > offset else { continue }
                let result = VeyrTurnExtractor.extractNewTurns(
                    from: url,
                    offset: offset > size ? 0 : offset,
                    startAtEndIfNew: false,
                    maxTurns: Self.maxTurnsPerFile)
                for turn in result.turns {
                    Self.ingest(userText: turn.userText, into: &store)
                }
                store.fileOffsets[url.path] = result.newOffset
            }
        }
        store.applyDecayIfDue(now: now)
        store.trimIfNeeded()
        store.lastUpdated = now
        try? store.save(to: storeURL)
        return store
    }

    /// Extracts derived features from one turn's user text and folds them
    /// into the store — the raw text itself is never retained past this call.
    static func ingest(userText: String, into store: inout VeyrPromptStyleStore) {
        let extraction = VeyrPromptStyleExtractor.extract(userText: userText)
        guard extraction != VeyrPromptStyleExtractor.Extraction() else { return }
        store.turnsObserved += 1
        for bigram in extraction.bigrams { store.bigrams[bigram, default: 0] += 1 }
        for trigram in extraction.trigrams { store.trigrams[trigram, default: 0] += 1 }
        if let opener = extraction.opener, !opener.isEmpty {
            store.openers[opener, default: 0] += 1
        }
        store.taskShapes[extraction.taskShape, default: 0] += 1
        for file in extraction.referencedFiles { store.referencedFiles[file, default: 0] += 1 }
        for symbol in extraction.referencedSymbols { store.referencedSymbols[symbol, default: 0] += 1 }
    }
}
