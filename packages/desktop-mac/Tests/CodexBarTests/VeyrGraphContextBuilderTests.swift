import Foundation
import Testing
import VeyrKit

struct VeyrGraphContextBuilderTests {
    private func makeGraph(isPartial: Bool = false, fileCount: Int = 3) throws -> CodebaseGraph {
        var nodes = [
            """
            {"id": "auth_ts", "label": "auth.ts", "source_file": "src/auth.ts", "source_location": "L1", "file_type": "code", "community": 1}
            """,
            """
            {"id": "refresh", "label": "refreshToken()", "source_file": "src/auth.ts", "source_location": "L84", "file_type": "code", "community": 1}
            """,
            """
            {"id": "handler", "label": "handleRequest()", "source_file": "src/proxy.ts", "source_location": "L23", "file_type": "code", "community": 2}
            """,
        ]
        for index in 0..<max(0, fileCount - 2) {
            nodes.append("""
            {"id": "f\(index)", "label": "file\(index).ts", "source_file": "src/file\(index).ts", "source_location": "L1", "file_type": "code", "community": 3}
            """)
        }
        let links = [
            """
            {"source": "auth_ts", "target": "refresh", "relation": "contains", "confidence": "EXTRACTED"}
            """,
            """
            {"source": "handler", "target": "refresh", "relation": "calls", "confidence": "EXTRACTED"}
            """,
        ]
        let json = """
        {"directed": false, "multigraph": false, "graph": {},
         "nodes": [\(nodes.joined(separator: ","))], "links": [\(links.joined(separator: ","))]}
        """
        let contents = try GraphifyGraphFile.decode(Data(json.utf8))
        return CodebaseGraph(
            nodes: contents.nodes,
            links: contents.links,
            workspaceRoot: "/w",
            generatedAt: Date(),
            graphifyVersion: "0.9.12",
            builtAtCommit: "abc",
            isPartial: isPartial,
            partialSubdirectory: isPartial ? "src" : nil)
    }

    // MARK: - graphContext (3a)

    @Test func buildsFullGraphContext() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/auth.ts", cursorLine: 90)
        let context = VeyrGraphContextBuilder.build(
            graph: graph, focused: focused, monthlySessionCount: 20)
        #expect(context.available)
        #expect(!context.isPartial)
        #expect(context.partialNote == nil)
        #expect(context.graphifyVersion == "0.9.12")
        #expect(context.nodeCount == graph.nodes.count)
        #expect(context.edgeCount == graph.links.count)
        #expect(context.activeFileSummary?.name == "refreshToken()")
        #expect(context.activeFileSummary?.callers == ["handleRequest()"])
        #expect(!context.criticalPath.isEmpty)
        #expect(!context.architecturalOverview.isEmpty)
    }

    @Test func partialGraphCarriesNote() throws {
        let graph = try self.makeGraph(isPartial: true)
        let context = VeyrGraphContextBuilder.build(
            graph: graph,
            focused: graph.focusedContext(activeFile: "", cursorLine: 0),
            monthlySessionCount: 0)
        #expect(context.isPartial)
        #expect(context.partialNote?.contains("Full graph building in background") == true)
    }

    @Test func tokenSavingsTiersByFileCount() throws {
        // < 50 files → 2000-token exploration estimate.
        let small = VeyrGraphContextBuilder.exploreTokens(fileCount: 10)
        #expect(small == 2000)
        #expect(VeyrGraphContextBuilder.exploreTokens(fileCount: 100) == 4000)
        #expect(VeyrGraphContextBuilder.exploreTokens(fileCount: 500) == 8000)

        let graph = try self.makeGraph()
        let context = VeyrGraphContextBuilder.build(
            graph: graph,
            focused: graph.focusedContext(activeFile: "", cursorLine: 0),
            monthlySessionCount: 10)
        #expect(context.tokenSavingsEstimate.withGraph == 400)
        #expect(context.tokenSavingsEstimate.savingsThisSession == 1600)
        #expect(context.tokenSavingsEstimate.savingsThisMonth == 16000)
    }

    // MARK: - CLAUDE.md graph section (3b)

    @Test func rendersGraphSectionWithMarkersAndHints() throws {
        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "/w/src/auth.ts", cursorLine: 90)
        let context = VeyrGraphContextBuilder.build(
            graph: graph, focused: focused, monthlySessionCount: 5)
        let section = VeyrGraphContextBuilder.claudeMdGraphSection(
            graph: graph, focused: focused, context: context)
        #expect(section.hasPrefix("<!-- veyr:graph-context:begin -->"))
        #expect(section.hasSuffix("<!-- veyr:graph-context:end -->"))
        #expect(section.contains("## Veyr codebase graph"))
        #expect(section.contains("Full graph"))
        #expect(!section.contains("Partial graph"))
        #expect(section.contains("Active context: refreshToken() (src/auth.ts:84)"))
        #expect(section.contains("**Called by:** handleRequest()"))
        // refreshToken() has 2 connections → leaf hint.
        #expect(section.contains("⚡ **Leaf function**"))
        #expect(section.contains("### Token savings"))
    }

    @Test func partialSectionWarns() throws {
        let graph = try self.makeGraph(isPartial: true)
        let focused = graph.focusedContext(activeFile: "", cursorLine: 0)
        let context = VeyrGraphContextBuilder.build(
            graph: graph, focused: focused, monthlySessionCount: 0)
        let section = VeyrGraphContextBuilder.claudeMdGraphSection(
            graph: graph, focused: focused, context: context)
        #expect(section.contains("Partial graph (full build in progress)"))
    }

    // MARK: - Writer: spend + graph sections coexist

    @Test func graphSectionCoexistsWithSpendSection() throws {
        let dir = FileManager.default.temporaryDirectory
            .appendingPathComponent("veyr-writer-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let claudeMd = dir.appendingPathComponent("CLAUDE.md")
        try Data("# My project\n".utf8).write(to: claudeMd)

        let graph = try self.makeGraph()
        let focused = graph.focusedContext(activeFile: "", cursorLine: 0)
        let context = VeyrGraphContextBuilder.build(
            graph: graph, focused: focused, monthlySessionCount: 1)
        let sectionV1 = VeyrGraphContextBuilder.claudeMdGraphSection(
            graph: graph, focused: focused, context: context)

        try VeyrAgentStatusWriter.updateClaudeMdGraphSection(
            projectPath: dir.path, section: sectionV1, createIfMissing: false)
        var content = try String(contentsOf: claudeMd, encoding: .utf8)
        #expect(content.contains("# My project"))
        #expect(content.contains("## Veyr codebase graph"))

        // Updating replaces in place — no duplicate sections.
        let sectionV2 = sectionV1.replacingOccurrences(of: "Full graph", with: "Full graph v2")
        try VeyrAgentStatusWriter.updateClaudeMdGraphSection(
            projectPath: dir.path, section: sectionV2, createIfMissing: false)
        content = try String(contentsOf: claudeMd, encoding: .utf8)
        #expect(content.components(separatedBy: "## Veyr codebase graph").count == 2)
        #expect(content.contains("Full graph v2"))

        // Removal leaves the rest of the file intact.
        try VeyrAgentStatusWriter.removeClaudeMdGraphSection(projectPath: dir.path)
        content = try String(contentsOf: claudeMd, encoding: .utf8)
        #expect(content.contains("# My project"))
        #expect(!content.contains("veyr:graph-context"))
    }
}
