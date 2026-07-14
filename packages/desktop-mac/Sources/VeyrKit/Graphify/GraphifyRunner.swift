// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import CodexBarCore
import Foundation

public enum GraphBuildState: Sendable {
    case notStarted
    /// Large codebase: a subdirectory graph is being built for immediate use while
    /// the full build follows. The estimate is surfaced so the app layer can notify.
    case buildingPartial(estimatedFullBuildSeconds: Int)
    case partialReady(CodebaseGraph)
    case buildingFull(partialGraph: CodebaseGraph?)
    case fullReady(CodebaseGraph)
    case failed(String)

    public var currentGraph: CodebaseGraph? {
        switch self {
        case let .partialReady(graph), let .fullReady(graph):
            return graph
        case let .buildingFull(partial):
            return partial
        case .notStarted, .buildingPartial, .failed:
            return nil
        }
    }
}

/// Builds and refreshes the Graphify graph for one workspace.
///
/// All builds run `python -m graphify update <root>` — the pure-AST path with zero
/// LLM calls (verified: GRAPH_REPORT shows "Token cost: 0"). Output lands under
/// `~/.veyr/cache/graphify/<hash>/` via GRAPHIFY_OUT, never inside the project.
/// Large codebases get a subdirectory "partial" graph first (measured: 0.3 s for a
/// small package vs 40 s for a 370 kLOC repo), then the full build replaces it.
public actor GraphifyRunner {
    private static let log = CodexBarLog.logger(LogCategories.veyrGraphify)

    /// Measured on Apple Silicon (see GRAPHIFY_INTEGRATION.md): ~0.3 s startup
    /// plus ~0.105 s per kLOC. The spec's 2 s/kLOC guess was ~20x too high.
    package static let startupSeconds = 0.3
    package static let secondsPerKiloLine = 0.12
    /// Builds expected to finish under this need no partial-first flow.
    package static let largeBuildThresholdSeconds = 10.0

    private let env: PythonEnvironment
    private let workspaceRoot: String
    private let homeDirectory: URL

    public private(set) var buildState: GraphBuildState = .notStarted {
        didSet { self.stateContinuation?.yield(self.buildState) }
    }

    private var stateContinuation: AsyncStream<GraphBuildState>.Continuation?
    private var buildRunning = false

    public init(
        env: PythonEnvironment,
        workspaceRoot: String,
        homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser)
    {
        self.env = env
        self.workspaceRoot = workspaceRoot
        self.homeDirectory = homeDirectory
    }

    /// Single-observer stream of state transitions for the app layer
    /// (menu bar, notifications, status writer).
    public func stateUpdates() -> AsyncStream<GraphBuildState> {
        AsyncStream { continuation in
            self.stateContinuation = continuation
            continuation.yield(self.buildState)
        }
    }

    public var currentGraph: CodebaseGraph? { self.buildState.currentGraph }

    // MARK: - Build orchestration

    /// Entry point at workspace open. Estimates size; large codebases get a partial
    /// subdirectory graph first, then the full build continues in the background.
    public func startBuild() async {
        guard !self.buildRunning else { return }
        self.buildRunning = true
        defer { self.buildRunning = false }

        let lineCount = await self.estimateLineCount()
        let estimate = Self.estimatedBuildSeconds(lineCount: lineCount)
        Self.log.info("Graph build starting: ~\(lineCount) lines, estimated \(Int(estimate))s")

        if estimate > Self.largeBuildThresholdSeconds,
           let subdirectory = await self.partialBuildTarget()
        {
            self.buildState = .buildingPartial(estimatedFullBuildSeconds: Int(estimate))
            if let partial = await self.build(subdirectory: subdirectory) {
                self.buildState = .buildingFull(partialGraph: partial)
                self.writeGraphCache(partial)
                Self.log.info("Partial graph ready (\(partial.nodes.count) nodes from \(subdirectory)); full build continuing")
            } else {
                // Partial failure is not fatal — fall through to the full build.
                self.buildState = .buildingFull(partialGraph: nil)
            }
        } else {
            self.buildState = .buildingFull(partialGraph: nil)
        }

        if let full = await self.build(subdirectory: nil) {
            self.buildState = .fullReady(full)
            self.writeGraphCache(full)
            Self.log.info("Full graph ready: \(full.fileCount) files, \(full.nodes.count) nodes, \(full.links.count) links")
        } else if case let .buildingFull(partial) = self.buildState, let partial {
            // Keep serving the partial graph rather than dropping to nothing.
            self.buildState = .partialReady(partial)
            Self.log.warning("Full build failed — continuing on partial graph")
        } else {
            self.buildState = .failed("graphify update failed for \(self.workspaceRoot)")
        }
    }

    /// Re-runs the (cache-backed) update after file changes. Callers debounce;
    /// Graphify's manifest cache skips unchanged files but re-clusters, so this
    /// is cheap for small repos and tens of seconds for very large ones.
    public func refresh() async {
        guard case .fullReady = self.buildState else { return }
        if let full = await self.build(subdirectory: nil) {
            self.buildState = .fullReady(full)
            self.writeGraphCache(full)
        }
    }

    public func focusedContext(activeFile: String, cursorLine: Int) -> FocusedContext {
        self.currentGraph?.focusedContext(activeFile: activeFile, cursorLine: cursorLine) ?? .empty
    }

    // MARK: - Graphify invocation

    private func build(subdirectory: String?) async -> CodebaseGraph? {
        let isPartial = subdirectory != nil
        let outDir = VeyrPaths.graphifyBuildDirectory(
            workspaceRoot: self.workspaceRoot,
            partial: isPartial,
            base: self.homeDirectory)
        VeyrPaths.ensureDirectoryExists(outDir)

        let scanRoot = subdirectory.map { "\(self.workspaceRoot)/\($0)" } ?? self.workspaceRoot
        var environment = ProcessInfo.processInfo.environment
        environment["GRAPHIFY_OUT"] = outDir.path
        environment["GRAPHIFY_NO_TIPS"] = "1"
        // Our update always rebuilds the complete corpus for its scan root, so a
        // shrink means code was really deleted — bypass the node-shrink guard that
        // exists to protect against *partial* rebuilds clobbering full graphs.
        environment["GRAPHIFY_FORCE"] = "1"

        let lineCount = isPartial ? 0 : await self.estimateLineCount()
        let timeout = isPartial
            ? 60.0
            : min(900.0, max(120.0, Self.estimatedBuildSeconds(lineCount: lineCount) * 6))

        do {
            _ = try await SubprocessRunner.run(
                binary: self.env.pythonPath,
                arguments: ["-m", "graphify", "update", scanRoot],
                environment: environment,
                timeout: timeout,
                label: isPartial ? "graphify-build-partial" : "graphify-build-full")
        } catch {
            Self.log.warning("graphify update failed (\(isPartial ? "partial" : "full")): \(error.localizedDescription)")
            return nil
        }

        return self.loadGraph(outDir: outDir, isPartial: isPartial, subdirectory: subdirectory)
    }

    private func loadGraph(outDir: URL, isPartial: Bool, subdirectory: String?) -> CodebaseGraph? {
        let graphURL = outDir.appendingPathComponent("graph.json")
        do {
            let data = try Data(contentsOf: graphURL)
            let contents = try GraphifyGraphFile.decode(data)
            return CodebaseGraph(
                nodes: contents.nodes,
                links: contents.links,
                workspaceRoot: self.workspaceRoot,
                generatedAt: Date(),
                graphifyVersion: self.env.graphifyVersion,
                builtAtCommit: contents.builtAtCommit,
                isPartial: isPartial,
                partialSubdirectory: subdirectory)
        } catch {
            Self.log.warning("Failed to load \(graphURL.path): \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Size estimation

    private func estimateLineCount() async -> Int {
        let command = """
        find "\(self.workspaceRoot)" \\( -name node_modules -o -name .build -o -name .git \\) -prune -o \
        -type f \\( -name '*.swift' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.py' \
        -o -name '*.go' -o -name '*.rs' \\) -print0 2>/dev/null | xargs -0 wc -l 2>/dev/null | tail -1 | awk '{print $1}'
        """
        guard let result = try? await SubprocessRunner.run(
            binary: "/bin/sh",
            arguments: ["-c", command],
            environment: ProcessInfo.processInfo.environment,
            timeout: 30,
            label: "graphify-line-count")
        else { return 0 }
        return Int(result.stdout.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
    }

    package static func estimatedBuildSeconds(lineCount: Int) -> Double {
        self.startupSeconds + Double(lineCount) / 1000.0 * self.secondsPerKiloLine
    }

    // MARK: - Partial build target

    /// Picks the top-level directory with the most recently changed files —
    /// the graph the developer needs first. Nil when git has no recent changes
    /// (then only the full build runs).
    private func partialBuildTarget() async -> String? {
        let command = """
        cd "\(self.workspaceRoot)" && { git diff --name-only HEAD~5 2>/dev/null; git status --porcelain 2>/dev/null | awk '{print $NF}'; }
        """
        guard let result = try? await SubprocessRunner.run(
            binary: "/bin/sh",
            arguments: ["-c", command],
            environment: ProcessInfo.processInfo.environment,
            timeout: 15,
            label: "graphify-recent-files")
        else { return nil }
        let changed = result.stdout.split(separator: "\n").map(String.init)
        let target = Self.partialBuildTarget(changedFiles: changed)
        guard let target,
              FileManager.default.fileExists(atPath: "\(self.workspaceRoot)/\(target)")
        else { return nil }
        return target
    }

    package static func partialBuildTarget(changedFiles: [String]) -> String? {
        // Two path components, not one: in a monorepo every change lives under
        // "packages/", and a "partial" build of that is the whole repo — the
        // E2E test hit exactly this (partial timed out at 124 s). Files directly
        // inside a top-level dir fall back to that dir.
        var counts: [String: Int] = [:]
        for file in changedFiles {
            let components = file.split(separator: "/")
            // Root-level files have no subdirectory to scope a partial build to.
            guard components.count > 1 else { continue }
            let prefix = components.count > 2
                ? "\(components[0])/\(components[1])"
                : String(components[0])
            counts[prefix, default: 0] += 1
        }
        return counts.max { ($0.value, $1.key) < ($1.value, $0.key) }?.key
    }

    // MARK: - Dashboard cache

    /// Writes the trimmed graph for the proxy's `GET /api/graph/current`. Raw
    /// graph.json was 63 MB on a 370 kLOC repo — the dashboard gets the top
    /// structural nodes only, plus summary fields.
    private func writeGraphCache(_ graph: CodebaseGraph) {
        let payload = Self.cachePayload(for: graph)
        let cacheURL = VeyrPaths.graphCacheFile(base: self.homeDirectory)
        VeyrPaths.ensureDirectoryExists(cacheURL.deletingLastPathComponent())
        do {
            let encoder = JSONEncoder()
            // The proxy and dashboard read this file — dates must be ISO-8601,
            // not Swift's reference-date seconds.
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(payload)
            try data.write(to: cacheURL, options: .atomic)
            Self.log.debug("Graph cache written: \(payload.nodes.count) nodes → \(cacheURL.path)")
        } catch {
            Self.log.warning("Graph cache write failed: \(error.localizedDescription)")
        }
    }

    package static let cacheMaxNodes = 2000
    package static let cacheMaxLinks = 12000

    public struct GraphCachePayload: Codable, Sendable {
        public struct Node: Codable, Sendable {
            public let id: String
            public let label: String
            public let kind: String
            public let file: String
            public let line: Int?
            public let community: Int?
            public let inDegree: Int
            public let outDegree: Int
        }

        public struct Link: Codable, Sendable {
            public let source: String
            public let target: String
            public let relation: String
        }

        public let schemaVersion: Int
        public let isPartial: Bool
        public let partialSubdirectory: String?
        public let workspaceRoot: String
        public let generatedAt: Date
        public let graphifyVersion: String
        public let builtAtCommit: String?
        public let fileCount: Int
        public let totalNodeCount: Int
        public let totalLinkCount: Int
        public let primaryLanguages: [String]
        public let nodes: [Node]
        public let links: [Link]
    }

    package static func cachePayload(for graph: CodebaseGraph) -> GraphCachePayload {
        // Same exclusions as criticalPath (import-hub symbols, vendored code), but
        // test files stay — the dashboard should show them.
        let kept = graph.nodes
            .filter {
                !$0.isExternal && $0.fileType == "code"
                    && graph.kinds[$0.id] != .symbol
                    && !CodebaseGraph.isVendoredPath($0.sourceFile)
            }
            .sorted { graph.totalDegree($0.id) > graph.totalDegree($1.id) }
            .prefix(self.cacheMaxNodes)
        let keptIDs = Set(kept.map(\.id))
        let links = graph.links
            .filter { $0.isStructural && keptIDs.contains($0.source) && keptIDs.contains($0.target) }
            .prefix(self.cacheMaxLinks)

        return GraphCachePayload(
            schemaVersion: 1,
            isPartial: graph.isPartial,
            partialSubdirectory: graph.partialSubdirectory,
            workspaceRoot: graph.workspaceRoot,
            generatedAt: graph.generatedAt,
            graphifyVersion: graph.graphifyVersion,
            builtAtCommit: graph.builtAtCommit,
            fileCount: graph.fileCount,
            totalNodeCount: graph.nodes.count,
            totalLinkCount: graph.links.count,
            primaryLanguages: graph.primaryLanguages,
            nodes: kept.map { node in
                GraphCachePayload.Node(
                    id: node.id,
                    label: node.label,
                    kind: (graph.kinds[node.id] ?? .symbol).rawValue,
                    file: node.sourceFile,
                    line: node.line,
                    community: node.community,
                    inDegree: graph.inDegree[node.id] ?? 0,
                    outDegree: graph.outDegree[node.id] ?? 0)
            },
            links: links.map { GraphCachePayload.Link(source: $0.source, target: $0.target, relation: $0.relation) })
    }
}
