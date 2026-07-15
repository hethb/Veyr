// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Locations of Veyr-specific state. Everything Veyr writes lives under `~/.veyr/`,
/// fully separate from CodexBar's own config/cache paths.
public enum VeyrPaths {
    public static func home(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        base.appendingPathComponent(".veyr", isDirectory: true)
    }

    public static func cacheDirectory(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.home(base: base).appendingPathComponent("cache", isDirectory: true)
    }

    public static func sessionsCacheFile(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.cacheDirectory(base: base).appendingPathComponent("sessions.json")
    }

    public static func tagOverridesFile(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.home(base: base).appendingPathComponent("tag-overrides.json")
    }

    public static func budgetControlsFile(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.home(base: base).appendingPathComponent("budget-controls.json")
    }

    public static func agentStatusDirectory(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.home(base: base).appendingPathComponent("agent-status", isDirectory: true)
    }

    /// Private venv used only when the user's Python is externally managed (PEP 668)
    /// and refuses `pip install --user`.
    public static func graphifyVenvDirectory(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.home(base: base).appendingPathComponent("graphify-venv", isDirectory: true)
    }

    /// Per-project GRAPHIFY_OUT roots. Graphify writes graphify-out/ into the scanned
    /// directory by default — pointing it here keeps user projects clean. Full and
    /// partial builds get separate dirs so Graphify's node-shrink guard never sees a
    /// small partial graph trying to overwrite a full one.
    public static func graphifyBuildDirectory(
        workspaceRoot: String,
        partial: Bool,
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        self.cacheDirectory(base: base)
            .appendingPathComponent("graphify", isDirectory: true)
            .appendingPathComponent(StableHash.hex(workspaceRoot), isDirectory: true)
            .appendingPathComponent(partial ? "partial" : "full", isDirectory: true)
    }

    /// Trimmed graph for the dashboard/proxy (`GET /api/graph/current`). The raw
    /// Graphify graph.json can be tens of MB; only the derived subset lives here.
    public static func graphCacheFile(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.cacheDirectory(base: base).appendingPathComponent("graph.json")
    }

    /// Focus override written by the dashboard's "Set as focus" (proxy POST
    /// /api/graph/focus); the Mac app reads it on each status tick.
    public static func graphFocusFile(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.cacheDirectory(base: base).appendingPathComponent("graph-focus.json")
    }

    /// Learned prompt-style corpus (VeyrPromptStyleStore) — derived n-grams,
    /// openers, task shapes, and referenced file/symbol tokens, never raw
    /// prompt text. Lives in cache/ like graph.json: fully rebuildable by
    /// rescanning the local JSONL logs, so wiping cache/ erases it entirely.
    public static func promptStyleStoreFile(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.cacheDirectory(base: base).appendingPathComponent("prompt-style.json")
    }

    /// Discovery file for the in-process daemon HTTP server the Mac app hosts
    /// while running (`VeyrDaemonServer`, packages/desktop-mac/Sources/CodexBar).
    /// The CLI reads this to find the live port; absent or unreachable means
    /// no daemon is running and callers should fall back to the flat files.
    public static func daemonInfoFile(base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        self.home(base: base).appendingPathComponent("daemon.json")
    }

    /// Deterministic, dependency-free path hash (FNV-1a 64) for cache directory names.
    /// Not cryptographic — only needs to be stable and collision-unlikely across the
    /// handful of workspaces one user opens.
    public enum StableHash {
        public static func hex(_ string: String) -> String {
            var hash: UInt64 = 0xcbf2_9ce4_8422_2325
            for byte in string.utf8 {
                hash ^= UInt64(byte)
                hash = hash &* 0x0000_0100_0000_01B3
            }
            return String(format: "%016llx", hash)
        }
    }

    @discardableResult
    public static func ensureDirectoryExists(_ url: URL, fileManager: FileManager = .default) -> Bool {
        if fileManager.fileExists(atPath: url.path) { return true }
        do {
            try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
            return true
        } catch {
            return false
        }
    }
}
