// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation
import Observation
import VeyrKit

/// Owns the Graphify pipeline for the active workspace: Python detection and
/// silent install (PythonEnvManager), graph builds (GraphifyRunner), refresh
/// polling (GraphWatcher), and the cached recent-git-changes set the G4 rule
/// needs. VeyrAgentStatusService drives it from its tick and reads the results.
@MainActor
@Observable
public final class VeyrGraphService {
    public static let shared = VeyrGraphService()

    @ObservationIgnored
    private let logger = CodexBarLog.logger(LogCategories.veyrGraphify)

    public private(set) var currentGraph: CodebaseGraph?
    public private(set) var buildState: GraphBuildState = .notStarted
    /// Repo-relative paths changed in recent git history for the active
    /// workspace; refreshed alongside each graph update.
    public private(set) var recentlyChangedFiles: Set<String> = []

    private var workspaceRoot: String?
    private var runner: GraphifyRunner?
    private var watcher: GraphWatcher?
    private var stateTask: Task<Void, Never>?
    private var pipelineTask: Task<Void, Never>?
    /// Fires when a graph becomes available or is replaced — the status service
    /// uses it to re-inject CLAUDE.md without waiting for the next tick.
    public var onGraphUpdated: (() -> Void)?

    private init() {}

    public var isEnabled: Bool {
        VeyrConfig.load().codebaseGraph ?? true
    }

    /// Called from every status tick with the active session's cwd. Starts the
    /// pipeline on first sight of a workspace, tears down and restarts when the
    /// workspace changes, and no-ops otherwise.
    public func ensureWorkspace(_ root: String?) {
        guard self.isEnabled else {
            self.teardown()
            return
        }
        guard let root, !root.isEmpty else { return }
        guard root != self.workspaceRoot else { return }
        // Sessions in a monorepo hop between the repo root and package dirs.
        // A parent graph already covers its subdirectories — keep it instead of
        // tearing down and rebuilding a smaller one (found live: a cd into
        // packages/vscode-extension replaced the 37k-node repo graph with an
        // 8-file one).
        if let current = self.workspaceRoot, root.hasPrefix(current + "/") { return }

        self.teardown()
        self.workspaceRoot = root
        self.pipelineTask = Task { [weak self] in
            await self?.startPipeline(root: root)
        }
    }

    /// Forces an on-demand rescan of `root` — used by `veyr graph --refresh`
    /// via the daemon. Unlike `ensureWorkspace`, this rebuilds even when `root`
    /// already matches the tracked workspace; `GraphifyRunner.startBuild()`
    /// itself no-ops if a build is already in flight, so this is safe to call
    /// while one is running.
    public func refreshNow(root: String) async {
        guard self.isEnabled, !root.isEmpty else { return }
        guard let current = self.workspaceRoot, root == current || root.hasPrefix(current + "/") else {
            self.ensureWorkspace(root)
            return
        }
        guard let runner = self.runner else {
            self.ensureWorkspace(root)
            return
        }
        await runner.startBuild()
    }

    public func focusedContext(activeFile: String?, cursorLine: Int) -> FocusedContext {
        guard let graph = self.currentGraph else { return .empty }
        guard let activeFile else {
            // No known active file: still surface the critical path.
            return graph.focusedContext(activeFile: "", cursorLine: 0)
        }
        return graph.focusedContext(activeFile: activeFile, cursorLine: cursorLine)
    }

    private func teardown() {
        self.pipelineTask?.cancel()
        self.pipelineTask = nil
        self.stateTask?.cancel()
        self.stateTask = nil
        if let watcher = self.watcher {
            Task { await watcher.stop() }
        }
        self.watcher = nil
        self.runner = nil
        self.workspaceRoot = nil
        self.currentGraph = nil
        self.buildState = .notStarted
    }

    private func startPipeline(root: String) async {
        guard let env = await PythonEnvManager.shared.ensureGraphify() else {
            self.logger.info("[Veyr/Graphify] Unavailable — graph features off for \(root)")
            return
        }
        guard !Task.isCancelled, self.workspaceRoot == root else { return }

        let runner = GraphifyRunner(env: env, workspaceRoot: root)
        self.runner = runner
        self.stateTask = Task { [weak self] in
            for await state in await runner.stateUpdates() {
                guard !Task.isCancelled else { return }
                await self?.handle(state: state, root: root)
            }
        }

        self.recentlyChangedFiles = await Self.gitChangedFiles(root: root)
        await runner.startBuild()

        guard !Task.isCancelled, self.workspaceRoot == root else { return }
        let watcher = GraphWatcher(runner: runner, workspaceRoot: root)
        self.watcher = watcher
        await watcher.start()
    }

    private func handle(state: GraphBuildState, root: String) async {
        guard self.workspaceRoot == root else { return }
        self.buildState = state
        switch state {
        case let .buildingPartial(estimatedFullBuildSeconds):
            let estimate = estimatedFullBuildSeconds >= 90
                ? "~\(Int((Double(estimatedFullBuildSeconds) / 60).rounded())) min"
                : "~\(estimatedFullBuildSeconds)s"
            AppNotifications.shared.post(
                idPrefix: "veyr-graph",
                title: "Veyr",
                body: "Analyzing your codebase (\(estimate)). A partial graph is available " +
                    "immediately; the full graph builds in the background.")
        case let .partialReady(graph), let .fullReady(graph):
            self.currentGraph = graph
            self.recentlyChangedFiles = await Self.gitChangedFiles(root: root)
            self.onGraphUpdated?()
        case let .buildingFull(partial):
            if let partial { self.currentGraph = partial }
        case let .failed(reason):
            self.logger.warning("[Veyr/Graphify] Build failed: \(reason)")
        case .notStarted:
            break
        }
    }

    // MARK: - Dashboard focus override

    /// Written by the proxy when the user clicks "Set as focus" on a graph node.
    struct FocusOverride: Codable {
        let file: String
        let line: Int?
        let setAt: Date
    }

    /// A dashboard-selected focus wins over the read-file heuristic while fresh.
    static let focusOverrideMaxAge: TimeInterval = 1800

    public func focusOverride(now: Date = Date()) -> (file: String, line: Int)? {
        guard let data = try? Data(contentsOf: VeyrPaths.graphFocusFile()) else { return nil }
        let decoder = JSONDecoder()
        // Tolerate fractional seconds — plain .iso8601 rejects "…T07:53:01.629Z"
        // and JS toISOString() emits milliseconds by default.
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: raw) { return date }
            let plain = ISO8601DateFormatter()
            if let date = plain.date(from: raw) { return date }
            throw DecodingError.dataCorrupted(.init(
                codingPath: decoder.codingPath, debugDescription: "Unparseable date: \(raw)"))
        }
        guard let override = try? decoder.decode(FocusOverride.self, from: data),
              now.timeIntervalSince(override.setAt) < Self.focusOverrideMaxAge
        else { return nil }
        return (override.file, override.line ?? 0)
    }

    /// Committed-recently + working-tree changes, repo-relative — G4's
    /// definition of "not stable".
    static func gitChangedFiles(root: String) async -> Set<String> {
        let command = """
        cd "\(root)" && { git diff --name-only HEAD~10 2>/dev/null; git status --porcelain 2>/dev/null | awk '{print $NF}'; }
        """
        guard let result = try? await SubprocessRunner.run(
            binary: "/bin/sh",
            arguments: ["-c", command],
            environment: ProcessInfo.processInfo.environment,
            timeout: 15,
            label: "graph-changed-files")
        else { return [] }
        return Set(result.stdout.split(separator: "\n").map(String.init).filter { !$0.isEmpty })
    }
}
