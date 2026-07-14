// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation

/// Scans Claude Code JSONL logs into per-session spend entries.
///
/// This extends — without modifying — CodexBar's vendored cost scanner:
/// `CostUsageScanner` aggregates day×model for its charts, while Veyr needs
/// per-session rows with the working directory (`cwd`) for feature tags and
/// burn rates. Reuses `CostUsageJsonl` (incremental byte scanner) and
/// `CostUsagePricing` (models.dev + built-in pricing) directly.
///
/// Privacy: only token counts, costs, timestamps, model IDs, session IDs, and
/// project paths are read or persisted. Prompt/response content is never stored.
public final class VeyrSessionScanner: @unchecked Sendable {
    // MARK: - Cache models (persisted to ~/.veyr/cache/sessions.json)

    struct CachedRow: Codable, Equatable {
        /// "messageId:requestId" when both exist; nil rows are always kept
        /// (mirrors CostUsageScanner's streaming-chunk dedupe convention).
        var key: String?
        var timestampMs: Int64
        var model: String
        var input: Int
        var output: Int
        var cacheRead: Int
        var cacheWrite: Int
        var isSidechain: Bool
    }

    struct CachedFile: Codable, Equatable {
        var mtimeMs: Int64
        var size: Int64
        var parsedBytes: Int64
        var sessionId: String?
        var cwd: String?
        var rows: [CachedRow]
    }

    struct Cache: Codable, Equatable {
        var version: Int = 1
        var files: [String: CachedFile] = [:]
    }

    // MARK: - State

    private let cacheFileURL: URL
    private let projectsRootsOverride: [URL]?
    private let lock = NSLock()
    private var cache = Cache()
    private var cacheLoaded = false

    public init(
        cacheFileURL: URL = VeyrPaths.sessionsCacheFile(),
        projectsRoots: [URL]? = nil)
    {
        self.cacheFileURL = cacheFileURL
        self.projectsRootsOverride = projectsRoots
    }

    // MARK: - Roots (same resolution as CostUsageScanner+Claude)

    public static func defaultProjectsRoots(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        home: URL = FileManager.default.homeDirectoryForCurrentUser) -> [URL]
    {
        if let env = environment["CLAUDE_CONFIG_DIR"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !env.isEmpty
        {
            return env.split(separator: ",").compactMap { part in
                let raw = String(part).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !raw.isEmpty else { return nil }
                let url = URL(fileURLWithPath: (raw as NSString).expandingTildeInPath)
                return url.lastPathComponent == "projects"
                    ? url
                    : url.appendingPathComponent("projects", isDirectory: true)
            }
        }
        return [
            home.appendingPathComponent(".config/claude/projects", isDirectory: true),
            home.appendingPathComponent(".claude/projects", isDirectory: true),
        ]
    }

    // MARK: - Scan

    /// Scans all Claude project logs and returns one `SessionEntry` per JSONL file.
    /// Unchanged files are served from cache; grown files are parsed incrementally
    /// from the last byte offset.
    public func scan(
        now: Date = Date(),
        tagInferrer: FeatureTagInferrer = .loadingOverrides()) -> [SessionEntry]
    {
        self.lock.lock()
        defer { self.lock.unlock() }
        self.loadCacheIfNeeded()

        let roots = self.projectsRootsOverride ?? Self.defaultProjectsRoots()
        var touched: Set<String> = []

        for root in roots {
            self.scanRoot(root, touched: &touched)
        }

        // Drop cache entries for files that no longer exist.
        for path in self.cache.files.keys where !touched.contains(path) {
            self.cache.files.removeValue(forKey: path)
        }

        self.persistCache()
        return self.buildSessions(now: now, tagInferrer: tagInferrer)
    }

    private func scanRoot(_ root: URL, touched: inout Set<String>) {
        let keys: [URLResourceKey] = [.isRegularFileKey, .contentModificationDateKey, .fileSizeKey]
        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: keys,
            options: [.skipsHiddenFiles, .skipsPackageDescendants])
        else { return }

        for case let url as URL in enumerator {
            guard url.pathExtension.lowercased() == "jsonl" else { continue }
            guard let values = try? url.resourceValues(forKeys: Set(keys)),
                  values.isRegularFile == true else { continue }
            let size = Int64(values.fileSize ?? 0)
            guard size > 0 else { continue }
            let mtimeMs = Int64((values.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000)

            let path = url.path
            touched.insert(path)

            if let cached = self.cache.files[path], cached.mtimeMs == mtimeMs, cached.size == size {
                continue
            }
            self.parseFile(url: url, size: size, mtimeMs: mtimeMs)
        }
    }

    private func parseFile(url: URL, size: Int64, mtimeMs: Int64) {
        let path = url.path
        let previous = self.cache.files[path]
        // Incremental only when the file strictly grew; otherwise full reparse.
        let canIncremental = previous.map {
            size > $0.size && $0.parsedBytes > 0 && $0.parsedBytes <= size
        } ?? false
        let startOffset = canIncremental ? (previous?.parsedBytes ?? 0) : 0

        var newRows: [CachedRow] = []
        var lastCwd: String? = canIncremental ? previous?.cwd : nil
        var sessionId: String? = canIncremental ? previous?.sessionId : nil

        let maxLineBytes = 512 * 1024
        let parsedBytes: Int64
        do {
            parsedBytes = try CostUsageJsonl.scan(
                fileURL: url,
                offset: startOffset,
                maxLineBytes: maxLineBytes,
                prefixBytes: maxLineBytes,
                onLine: { line in
                    guard !line.bytes.isEmpty, !line.wasTruncated else { return }
                    guard line.bytes.containsAscii(#""type":"assistant""#) else { return }
                    guard line.bytes.containsAscii(#""usage""#) else { return }

                    autoreleasepool {
                        guard
                            let obj = (try? JSONSerialization.jsonObject(with: line.bytes)) as? [String: Any],
                            obj["type"] as? String == "assistant",
                            let message = obj["message"] as? [String: Any],
                            let model = message["model"] as? String,
                            let usage = message["usage"] as? [String: Any],
                            let tsText = obj["timestamp"] as? String,
                            let timestamp = Self.parseTimestamp(tsText)
                        else { return }

                        func toInt(_ value: Any?) -> Int {
                            (value as? NSNumber)?.intValue ?? 0
                        }

                        let input = max(0, toInt(usage["input_tokens"]))
                        let cacheWrite = max(0, toInt(usage["cache_creation_input_tokens"]))
                        let cacheRead = max(0, toInt(usage["cache_read_input_tokens"]))
                        let output = max(0, toInt(usage["output_tokens"]))
                        if input == 0, cacheWrite == 0, cacheRead == 0, output == 0 { return }

                        if let cwd = obj["cwd"] as? String, !cwd.isEmpty {
                            lastCwd = cwd
                        }
                        if sessionId == nil {
                            sessionId = obj["sessionId"] as? String ?? obj["session_id"] as? String
                        }

                        let messageId = message["id"] as? String
                        let requestId = obj["requestId"] as? String
                        let key: String? = if let messageId, let requestId {
                            "\(messageId):\(requestId)"
                        } else {
                            nil
                        }

                        newRows.append(CachedRow(
                            key: key,
                            timestampMs: Int64((timestamp.timeIntervalSince1970 * 1000).rounded()),
                            model: CostUsagePricing.normalizeClaudeModel(model),
                            input: input,
                            output: output,
                            cacheRead: cacheRead,
                            cacheWrite: cacheWrite,
                            isSidechain: (usageBool(obj["isSidechain"]))))
                    }
                })
        } catch {
            return
        }

        let baseRows = canIncremental ? (previous?.rows ?? []) : []
        let merged = Self.mergeRows(existing: baseRows, delta: newRows)
        self.cache.files[path] = CachedFile(
            mtimeMs: mtimeMs,
            size: size,
            parsedBytes: parsedBytes,
            sessionId: sessionId ?? url.deletingPathExtension().lastPathComponent,
            cwd: lastCwd,
            rows: merged)
    }

    /// Streaming chunks share message.id + requestId within a file; the final
    /// cumulative chunk wins. Keyless rows (older logs) are always kept.
    static func mergeRows(existing: [CachedRow], delta: [CachedRow]) -> [CachedRow] {
        var keyed: [String: CachedRow] = [:]
        var unkeyed: [CachedRow] = []
        for row in existing + delta {
            if let key = row.key {
                keyed[key] = row
            } else {
                unkeyed.append(row)
            }
        }
        return keyed.keys.sorted().compactMap { keyed[$0] } + unkeyed
    }

    // MARK: - Sessions

    private func buildSessions(now: Date, tagInferrer: FeatureTagInferrer) -> [SessionEntry] {
        let catalog = CostUsagePricing.modelsDevCatalog(now: now, cacheRoot: nil)
        var sessions: [SessionEntry] = []

        for (path, file) in self.cache.files {
            guard !file.rows.isEmpty else { continue }

            var usage = TokenUsage()
            var modelCounts: [String: Int] = [:]
            var minTs = Int64.max
            var maxTs = Int64.min

            for row in file.rows {
                let cost = ModelPricing.cost(
                    for: row.model,
                    inputTokens: row.input,
                    outputTokens: row.output,
                    cacheReadTokens: row.cacheRead,
                    cacheWriteTokens: row.cacheWrite,
                    pricingDate: Date(timeIntervalSince1970: Double(row.timestampMs) / 1000),
                    modelsDevCatalog: catalog,
                    modelsDevCacheRoot: nil)
                usage = usage + TokenUsage(
                    inputTokens: row.input,
                    outputTokens: row.output,
                    cacheReadTokens: row.cacheRead,
                    cacheWriteTokens: row.cacheWrite,
                    costUSD: cost)
                modelCounts[row.model, default: 0] += 1
                minTs = min(minTs, row.timestampMs)
                maxTs = max(maxTs, row.timestampMs)
            }

            let dominantModel = modelCounts.max {
                ($0.value, $1.key) < ($1.value, $0.key)
            }?.key ?? "unknown"

            // Deterministic ID per session file so UI selection survives rescans.
            let stableId = UUID(deterministicSeed: path)
            sessions.append(SessionEntry(
                id: stableId,
                timestamp: Date(timeIntervalSince1970: Double(maxTs) / 1000),
                startedAt: Date(timeIntervalSince1970: Double(minTs) / 1000),
                provider: "claude",
                modelId: dominantModel,
                featureTag: tagInferrer.inferTag(from: file.cwd),
                usage: usage,
                projectPath: file.cwd,
                sessionId: file.sessionId,
                entryCount: file.rows.count))
        }

        return sessions.sorted { $0.timestamp > $1.timestamp }
    }

    private static func parseTimestamp(_ text: String) -> Date? {
        // Reuse upstream's lock-protected ISO-8601 parser (concurrency-safe).
        CostUsageScanner.dateFromTimestamp(text)
    }

    /// Clears the in-memory and on-disk row cache. The next scan rebuilds it
    /// from the JSONL logs (which are never touched).
    public func resetCache() {
        self.lock.lock()
        defer { self.lock.unlock() }
        self.cache = Cache()
        self.cacheLoaded = true
        try? FileManager.default.removeItem(at: self.cacheFileURL)
    }

    /// Most recent modification time across all known session files.
    /// Drives the "active session" indicator in the menu bar.
    public func latestActivityAt() -> Date? {
        self.lock.lock()
        defer { self.lock.unlock() }
        self.loadCacheIfNeeded()
        let maxMtime = self.cache.files.values.map(\.mtimeMs).max()
        return maxMtime.map { Date(timeIntervalSince1970: Double($0) / 1000) }
    }

    // MARK: - Cache persistence

    private func loadCacheIfNeeded() {
        guard !self.cacheLoaded else { return }
        self.cacheLoaded = true
        guard let data = try? Data(contentsOf: self.cacheFileURL),
              let decoded = try? JSONDecoder().decode(Cache.self, from: data),
              decoded.version == 1
        else { return }
        self.cache = decoded
    }

    private func persistCache() {
        VeyrPaths.ensureDirectoryExists(self.cacheFileURL.deletingLastPathComponent())
        guard let data = try? JSONEncoder().encode(self.cache) else { return }
        try? data.write(to: self.cacheFileURL, options: [.atomic])
    }
}

private func usageBool(_ value: Any?) -> Bool {
    if let bool = value as? Bool { return bool }
    if let number = value as? NSNumber { return number.boolValue }
    return false
}

extension UUID {
    /// Stable UUID derived from a string seed (FNV-1a over the seed, twice with
    /// different bases, packed into the 16 UUID bytes).
    init(deterministicSeed seed: String) {
        func fnv1a(_ text: String, basis: UInt64) -> UInt64 {
            var hash = basis
            for byte in text.utf8 {
                hash ^= UInt64(byte)
                hash = hash &* 0x0000_0100_0000_01B3
            }
            return hash
        }
        let high = fnv1a(seed, basis: 0xCBF2_9CE4_8422_2325)
        let low = fnv1a(seed, basis: 0x9E37_79B9_7F4A_7C15)
        var bytes = [UInt8]()
        for shift in stride(from: 56, through: 0, by: -8) {
            bytes.append(UInt8(truncatingIfNeeded: high >> UInt64(shift)))
        }
        for shift in stride(from: 56, through: 0, by: -8) {
            bytes.append(UInt8(truncatingIfNeeded: low >> UInt64(shift)))
        }
        self = UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}
