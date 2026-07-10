// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Keeps a workspace's graph fresh by polling a cheap git fingerprint and asking
/// the runner to refresh when it changes.
///
/// Deliberately not Graphify's own `watch` command: that needs the `watchdog`
/// extra (absent from Veyr's pinned install) and a persistent Python process per
/// workspace. And deliberately not `graphify hook install`: Veyr must not write
/// git hooks into user repositories. Polling matches how the rest of the app
/// observes external state (see VeyrAgentStatusService).
public actor GraphWatcher {
    private static let log = CodexBarLog.logger(LogCategories.veyrGraphify)

    package static let pollInterval: TimeInterval = 30
    /// Graph refreshes re-cluster and re-export the whole graph (measured 26 s
    /// on a 370 kLOC repo even with a warm cache), so rate-limit them hard.
    package static let minRefreshInterval: TimeInterval = 300

    private let runner: GraphifyRunner
    private let workspaceRoot: String
    private var loop: Task<Void, Never>?
    private var lastFingerprint: String?
    private var lastRefreshAt: Date?

    public init(runner: GraphifyRunner, workspaceRoot: String) {
        self.runner = runner
        self.workspaceRoot = workspaceRoot
    }

    public func start() {
        guard self.loop == nil else { return }
        self.loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.pollOnce()
                try? await Task.sleep(for: .seconds(Self.pollInterval))
            }
        }
    }

    public func stop() {
        self.loop?.cancel()
        self.loop = nil
    }

    package func pollOnce() async {
        guard let fingerprint = await self.currentFingerprint() else { return }
        let changed = self.lastFingerprint != nil && fingerprint != self.lastFingerprint
        // First observation just establishes the baseline — the runner's initial
        // build already covers the current state.
        if self.lastFingerprint == nil {
            self.lastFingerprint = fingerprint
            return
        }
        guard changed,
              Self.shouldRefresh(lastRefreshAt: self.lastRefreshAt, now: Date())
        else { return }

        self.lastFingerprint = fingerprint
        self.lastRefreshAt = Date()
        Self.log.info("Workspace changed — refreshing graph for \(self.workspaceRoot)")
        await self.runner.refresh()
    }

    /// HEAD commit + working-tree status: catches commits, checkouts, merges,
    /// and uncommitted edits in one cheap call. Nil for non-git workspaces
    /// (no refresh signal; the initial build still serves those).
    private func currentFingerprint() async -> String? {
        let command = """
        git -C "\(self.workspaceRoot)" rev-parse HEAD 2>/dev/null && \
        git -C "\(self.workspaceRoot)" status --porcelain 2>/dev/null
        """
        guard let result = try? await SubprocessRunner.run(
            binary: "/bin/sh",
            arguments: ["-c", command],
            environment: ProcessInfo.processInfo.environment,
            timeout: 15,
            label: "graph-watch-fingerprint"),
            !result.stdout.isEmpty
        else { return nil }
        return VeyrPaths.StableHash.hex(result.stdout)
    }

    package static func shouldRefresh(lastRefreshAt: Date?, now: Date) -> Bool {
        guard let lastRefreshAt else { return true }
        return now.timeIntervalSince(lastRefreshAt) >= self.minRefreshInterval
    }
}
