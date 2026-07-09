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
