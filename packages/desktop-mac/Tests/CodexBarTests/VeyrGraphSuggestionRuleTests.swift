import CodexBarCore
import Foundation
import Testing

/// Per-rule tests for the graph-powered suggestions, driven through the public
/// analyze() and asserted on stable ids. Fixture graphs are decoded from JSON in
/// Graphify's real shape (no synthetic constructors — same path as production).
struct VeyrGraphSuggestionRuleTests {
    // MARK: - Fixture

    /// Workspace /w with:
    /// - src/leaf.ts: `leaf()` with degree 2 (one caller + file contains) — G1 target
    /// - src/hub.ts:  `hub()` with 22 callers — G2/G5 target
    /// - src/app.ts:  file importing lib/dep1.ts and lib/dep2.ts — G3 target
    private static func fixtureJSON() -> String {
        var nodes: [String] = [
            node(id: "leaf_file", label: "leaf.ts", file: "src/leaf.ts", line: 1),
            node(id: "leaf", label: "leaf()", file: "src/leaf.ts", line: 10),
            node(id: "leaf_caller", label: "main()", file: "src/main.ts", line: 3),
            node(id: "hub_file", label: "hub.ts", file: "src/hub.ts", line: 1),
            node(id: "hub", label: "hub()", file: "src/hub.ts", line: 5),
            node(id: "app_file", label: "app.ts", file: "src/app.ts", line: 1),
            node(id: "dep1", label: "dep1.ts", file: "lib/dep1.ts", line: 1),
            node(id: "dep2", label: "dep2.ts", file: "lib/dep2.ts", line: 1),
        ]
        var links: [String] = [
            link(from: "leaf_file", to: "leaf", relation: "contains"),
            link(from: "leaf_caller", to: "leaf", relation: "calls"),
            link(from: "hub_file", to: "hub", relation: "contains"),
            link(from: "app_file", to: "dep1", relation: "imports"),
            link(from: "app_file", to: "dep2", relation: "imports"),
        ]
        for index in 0..<22 {
            nodes.append(Self.node(
                id: "c\(index)", label: "caller\(index)()", file: "src/callers.ts", line: index + 1))
            links.append(Self.link(from: "c\(index)", to: "hub", relation: "calls"))
        }
        return """
        {"directed": false, "multigraph": false, "graph": {},
         "nodes": [\(nodes.joined(separator: ","))],
         "links": [\(links.joined(separator: ","))]}
        """
    }

    private static func node(id: String, label: String, file: String, line: Int) -> String {
        """
        {"id": "\(id)", "label": "\(label)", "source_file": "\(file)", \
        "source_location": "L\(line)", "file_type": "code", "community": 1}
        """
    }

    private static func link(from: String, to: String, relation: String) -> String {
        """
        {"source": "\(from)", "target": "\(to)", "relation": "\(relation)", "confidence": "EXTRACTED"}
        """
    }

    private func makeGraph() throws -> CodebaseGraph {
        let contents = try GraphifyGraphFile.decode(Data(Self.fixtureJSON().utf8))
        return CodebaseGraph(
            nodes: contents.nodes,
            links: contents.links,
            workspaceRoot: "/w",
            generatedAt: Date(),
            graphifyVersion: "0.9.12",
            builtAtCommit: nil,
            isPartial: false,
            partialSubdirectory: nil)
    }

    private func session(
        model: String = "claude-opus-4-8",
        cost: Double = 1.0,
        tag: String = "veyr",
        projectPath: String = "/w") -> SessionEntry
    {
        SessionEntry(
            timestamp: Date(),
            startedAt: Date().addingTimeInterval(-600),
            provider: "claude",
            modelId: model,
            featureTag: tag,
            usage: TokenUsage(inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, costUSD: cost),
            projectPath: projectPath,
            sessionId: "s-current",
            entryCount: 5)
    }

    private func signals(id: String, cwd: String, readFiles: [String]) -> VeyrSessionSignals {
        VeyrSessionSignals(
            sessionId: id,
            cwd: cwd,
            lastTimestamp: Date(),
            toolNames: ["Read"],
            toolUseCount: readFiles.count,
            messageCount: 10,
            retryClusters: 0,
            readFiles: readFiles)
    }

    private func ids(_ suggestions: [Suggestion]) -> [String] {
        suggestions.map { String($0.id.split(separator: ":")[0]) }
    }

    // MARK: - G1: leaf node on expensive model

    @Test func g1FiresForLeafFunctionOnFrontierModel() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/leaf.ts", cursorLine: 12)
        #expect(focused.activeNode?.id == "leaf")
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(model: "claude-opus-4-8", cost: 0.60),
            currentSessionIsActive: true))
        let g1 = suggestions.first { $0.id.hasPrefix("g1-") }
        #expect(g1 != nil)
        #expect(g1?.suggestedModel == "claude-haiku-4-5")
        #expect(g1?.action == .switchModel)
        #expect(abs((g1?.estimatedMonthlySavingsUSD ?? 0) - 0.57) < 0.001)
    }

    @Test func g1RespectsGates() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/leaf.ts", cursorLine: 12)

        // Cheap model → no suggestion.
        var suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(model: "claude-haiku-4-5", cost: 0.60),
            currentSessionIsActive: true))
        #expect(!self.ids(suggestions).contains("g1-leaf-model"))

        // Cost below $0.50 → no suggestion.
        suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(cost: 0.30),
            currentSessionIsActive: true))
        #expect(!self.ids(suggestions).contains("g1-leaf-model"))

        // Inactive session → no suggestion.
        suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(cost: 0.60),
            currentSessionIsActive: false))
        #expect(!self.ids(suggestions).contains("g1-leaf-model"))

        // High-connectivity node (hub, 23 connections) → no G1.
        let hubFocus = graph.focusedContext(activeFile: "/w/src/hub.ts", cursorLine: 6)
        suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: hubFocus,
            currentSession: self.session(cost: 0.60),
            currentSessionIsActive: true))
        #expect(!self.ids(suggestions).contains("g1-leaf-model"))
    }

    @Test func g1OpenAISessionsSuggestMini() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/leaf.ts", cursorLine: 12)
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(model: "gpt-4o", cost: 0.60),
            currentSessionIsActive: true))
        #expect(suggestions.first { $0.id.hasPrefix("g1-") }?.suggestedModel == "gpt-4o-mini")
    }

    // MARK: - G4: redundant file reading

    @Test func g4FiresForStableRereads() throws {
        let reads = ["/w/src/a.ts", "/w/src/b.ts", "/w/src/c.ts"]
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            currentSession: self.session(),
            currentSessionIsActive: true,
            signals: [
                self.signals(id: "s1", cwd: "/w", readFiles: reads),
                self.signals(id: "s2", cwd: "/w", readFiles: reads),
                self.signals(id: "s3", cwd: "/w", readFiles: reads),
            ]))
        let g4 = suggestions.first { $0.id.hasPrefix("g4-") }
        #expect(g4 != nil)
        #expect(g4?.action == .useGraphContext)
        #expect((g4?.estimatedMonthlySavingsUSD ?? 0) > 0)
    }

    @Test func g4IgnoresRecentlyChangedFiles() throws {
        let reads = ["/w/src/a.ts", "/w/src/b.ts", "/w/src/c.ts"]
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            currentSession: self.session(),
            signals: [
                self.signals(id: "s1", cwd: "/w", readFiles: reads),
                self.signals(id: "s2", cwd: "/w", readFiles: reads),
            ],
            recentlyChangedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"]))
        #expect(!self.ids(suggestions).contains("g4-redundant-reads"))
    }

    @Test func g4NeedsRecurrenceAcrossSessions() throws {
        // One session reading files is exploration, not waste.
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            currentSession: self.session(),
            signals: [self.signals(id: "s1", cwd: "/w", readFiles: ["/w/a.ts", "/w/b.ts", "/w/c.ts"])]))
        #expect(!self.ids(suggestions).contains("g4-redundant-reads"))

        // Different project's sessions don't count.
        let other = VeyrGraphSuggestionEngine.analyze(.init(
            currentSession: self.session(),
            signals: [
                self.signals(id: "s1", cwd: "/elsewhere", readFiles: ["/elsewhere/a.ts", "/elsewhere/b.ts", "/elsewhere/c.ts"]),
                self.signals(id: "s2", cwd: "/elsewhere", readFiles: ["/elsewhere/a.ts", "/elsewhere/b.ts", "/elsewhere/c.ts"]),
            ]))
        #expect(!self.ids(other).contains("g4-redundant-reads"))
    }

    @Test func stabilityCheckMapsAbsoluteToRelative() {
        #expect(VeyrGraphSuggestionEngine.isRecentlyChanged(
            "/w/src/a.ts", cwd: "/w", changed: ["src/a.ts"]))
        #expect(!VeyrGraphSuggestionEngine.isRecentlyChanged(
            "/w/src/a.ts", cwd: "/w", changed: ["src/b.ts"]))
        #expect(!VeyrGraphSuggestionEngine.isRecentlyChanged(
            "/other/src/a.ts", cwd: "/w", changed: ["src/a.ts"]))
    }

    // MARK: - G3: unexplored dependency chain

    @Test func g3FiresForImportsOutsideExploredCwds() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/app.ts", cursorLine: 1)
        #expect(focused.imports.count == 2)
        // Sessions have only ever run in /w/src — /w/lib is unexplored.
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(),
            signals: [self.signals(id: "s1", cwd: "/w/src", readFiles: [])]))
        // signals with empty readFiles: G3 only cares about cwd.
        let g3 = suggestions.first { $0.id.hasPrefix("g3-") }
        #expect(g3 != nil)
        #expect(g3?.severity == .medium)
    }

    @Test func g3SilentWhenRootCwdCoversEverything() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/app.ts", cursorLine: 1)
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(),
            signals: [self.signals(id: "s1", cwd: "/w", readFiles: [])]))
        #expect(!self.ids(suggestions).contains("g3-unexplored"))
    }

    @Test func exploredPrefixLogic() {
        #expect(VeyrGraphSuggestionEngine.isExplored(directory: "/w/lib", cwds: ["/w"]))
        #expect(VeyrGraphSuggestionEngine.isExplored(directory: "/w", cwds: ["/w/lib"]))
        #expect(!VeyrGraphSuggestionEngine.isExplored(directory: "/w/lib", cwds: ["/w/src"]))
        // No false prefix matches on sibling names.
        #expect(!VeyrGraphSuggestionEngine.isExplored(directory: "/w/lib2", cwds: ["/w/lib"]))
    }

    // MARK: - G2: god node warning

    @Test func g2FiresForHighDegreeFunction() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/hub.ts", cursorLine: 6)
        #expect(focused.activeNode?.id == "hub")
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused, currentSession: self.session()))
        let g2 = suggestions.first { $0.id.hasPrefix("g2-") }
        #expect(g2 != nil)
        #expect(g2?.severity == .high)
        #expect(g2?.estimatedMonthlySavingsUSD == 0)
        #expect(g2?.action == .writeTestFirst)
    }

    @Test func g2IgnoresFileNodes() throws {
        // callers.ts contains 22 functions but a big file is size, not impact.
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/callers.ts", cursorLine: 0)
        #expect(focused.activeNode?.id == nil || graph.kinds[focused.activeNode!.id] != .function)
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused, currentSession: self.session()))
        #expect(!self.ids(suggestions).contains("g2-god-node"))
    }

    // MARK: - G5: test coverage gap

    @Test func g5FiresForUntestedHighConnectivityNode() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/hub.ts", cursorLine: 6)
        let monthlySessions = [self.session(cost: 6.0)]
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(),
            sessions: monthlySessions))
        let g5 = suggestions.first { $0.id.hasPrefix("g5-") }
        #expect(g5 != nil)
        #expect(g5?.severity == .low)
        // 2 × avg session cost (one session at $6).
        #expect(abs((g5?.estimatedMonthlySavingsUSD ?? 0) - 12.0) < 0.001)
    }

    @Test func g5SilentWhenTagSpendIsLow() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/hub.ts", cursorLine: 6)
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(),
            sessions: [self.session(cost: 2.0)]))
        #expect(!self.ids(suggestions).contains("g5-test-gap"))
    }

    @Test func g5SilentForLeafNodes() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/leaf.ts", cursorLine: 12)
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(),
            sessions: [self.session(cost: 6.0)]))
        #expect(!self.ids(suggestions).contains("g5-test-gap"))
    }

    // MARK: - Priority ordering

    @Test func rulesReturnInPriorityOrder() throws {
        // hub focus + high tag spend → G2 and G5 both fire, in G2-before-G5 order.
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/hub.ts", cursorLine: 6)
        let suggestions = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: focused,
            currentSession: self.session(),
            sessions: [self.session(cost: 6.0)]))
        #expect(self.ids(suggestions) == ["g2-god-node", "g5-test-gap"])

        // G4 + G3 both fire (sessions confined to /w/src, so /w/lib imports are
        // unexplored while the same stable files get re-read) → G4 before G3.
        let appFocus = graph.focusedContext(activeFile: "/w/src/app.ts", cursorLine: 1)
        let reads = ["/w/src/a.ts", "/w/src/b.ts", "/w/src/c.ts"]
        let combined = VeyrGraphSuggestionEngine.analyze(.init(
            graph: graph, focused: appFocus,
            currentSession: self.session(projectPath: "/w/src"),
            signals: [
                self.signals(id: "s1", cwd: "/w/src", readFiles: reads),
                self.signals(id: "s2", cwd: "/w/src", readFiles: reads),
            ]))
        #expect(self.ids(combined) == ["g4-redundant-reads", "g3-unexplored"])
    }
}
