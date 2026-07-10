// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation
import Observation

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

        self.teardown()
        self.workspaceRoot = root
        self.pipelineTask = Task { [weak self] in
            await self?.startPipeline(root: root)
        }
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
