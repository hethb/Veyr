import CodexBarCore
import Foundation
import Testing

struct VeyrGraphifyGraphTests {
    /// Minimal graph.json in Graphify's real shape: "links" key, "L<line>"
    /// locations, no node type field.
    private static let fixture = """
    {
      "directed": false,
      "multigraph": false,
      "graph": {},
      "built_at_commit": "abc1234",
      "nodes": [
        {"id": "auth_ts", "label": "auth.ts", "source_file": "src/auth.ts", "source_location": "L1", "file_type": "code", "community": 1},
        {"id": "refresh", "label": "refreshToken()", "source_file": "src/auth.ts", "source_location": "L84", "file_type": "code", "community": 1},
        {"id": "handler", "label": "handleRequest()", "source_file": "src/proxy.ts", "source_location": "L23", "file_type": "code", "community": 1},
        {"id": "store", "label": "TokenStore", "source_file": "src/store.ts", "source_location": "L10", "file_type": "code", "community": 2},
        {"id": "base_store", "label": "BaseStore", "source_file": "src/store.ts", "source_location": "L2", "file_type": "code", "community": 2},
        {"id": "auth_test", "label": "testRefresh()", "source_file": "tests/auth.test.ts", "source_location": "L5", "file_type": "code", "community": 3},
        {"id": "foundation", "label": "Foundation", "source_file": "", "source_location": "", "file_type": "code", "community": 4},
        {"id": "vendored", "label": "bio.cc", "source_file": ".build/checkouts/crypto/bio.cc", "source_location": "L1", "file_type": "code", "community": 5},
        {"id": "readme", "label": "README.md", "source_file": "README.md", "source_location": "L1", "file_type": "document", "community": 6},
        {"id": "corelib", "label": "CoreLib", "source_file": "src/misc.ts", "source_location": "L3", "file_type": "code", "community": 1}
      ],
      "links": [
        {"source": "auth_ts", "target": "refresh", "relation": "contains", "confidence": "EXTRACTED"},
        {"source": "handler", "target": "refresh", "relation": "calls", "confidence": "EXTRACTED"},
        {"source": "auth_test", "target": "refresh", "relation": "calls", "confidence": "EXTRACTED"},
        {"source": "refresh", "target": "store", "relation": "calls", "confidence": "INFERRED"},
        {"source": "store", "target": "get", "relation": "method", "confidence": "EXTRACTED"},
        {"source": "store", "target": "base_store", "relation": "inherits", "confidence": "EXTRACTED"},
        {"source": "auth_ts", "target": "foundation", "relation": "imports", "confidence": "EXTRACTED"},
        {"source": "handler", "target": "refresh", "relation": "references", "confidence": "EXTRACTED"},
        {"source": "vendored", "target": "refresh", "relation": "calls", "confidence": "EXTRACTED"},
        {"source": "auth_ts", "target": "corelib", "relation": "imports", "confidence": "EXTRACTED"},
        {"source": "handler", "target": "corelib", "relation": "imports", "confidence": "EXTRACTED"},
        {"source": "store", "target": "corelib", "relation": "imports", "confidence": "EXTRACTED"},
        {"source": "auth_test", "target": "corelib", "relation": "imports", "confidence": "EXTRACTED"},
        {"source": "readme", "target": "corelib", "relation": "imports", "confidence": "EXTRACTED"},
        {"source": "vendored", "target": "corelib", "relation": "imports", "confidence": "EXTRACTED"}
      ]
    }
    """

    private func loadGraph(isPartial: Bool = false) throws -> CodebaseGraph {
        let contents = try GraphifyGraphFile.decode(Data(Self.fixture.utf8))
        return CodebaseGraph(
            nodes: contents.nodes,
            links: contents.links,
            workspaceRoot: "/Users/x/project",
            generatedAt: Date(),
            graphifyVersion: "0.9.12",
            builtAtCommit: contents.builtAtCommit,
            isPartial: isPartial,
            partialSubdirectory: isPartial ? "src" : nil)
    }

    // MARK: - Decoding

    @Test func decodesRealShape() throws {
        let graph = try self.loadGraph()
        #expect(graph.nodes.count == 10)
        #expect(graph.links.count == 15)
        #expect(graph.builtAtCommit == "abc1234")
        let refresh = graph.node(id: "refresh")
        #expect(refresh?.line == 84)
        #expect(refresh?.language == "TypeScript")
        #expect(graph.node(id: "foundation")?.isExternal == true)
    }

    @Test func parsesLineLocations() {
        #expect(GraphifyGraphFile.parseLine("L84") == 84)
        #expect(GraphifyGraphFile.parseLine("L1") == 1)
        #expect(GraphifyGraphFile.parseLine("") == nil)
        #expect(GraphifyGraphFile.parseLine(nil) == nil)
        #expect(GraphifyGraphFile.parseLine("84") == nil)
    }

    // MARK: - Derived kinds (Graphify emits no node type)

    @Test func derivesNodeKinds() throws {
        let graph = try self.loadGraph()
        #expect(graph.kinds["refresh"] == .function)
        #expect(graph.kinds["auth_ts"] == .file)
        #expect(graph.kinds["store"] == .class)       // method source + inherits source
        #expect(graph.kinds["base_store"] == .class)  // inherits target
        #expect(graph.kinds["foundation"] == .symbol)
    }

    // MARK: - Degree (structural only)

    @Test func degreeExcludesReferences() throws {
        let graph = try self.loadGraph()
        // refresh: in = calls from handler, auth_test, vendored + contains from auth_ts = 4.
        // The additional handler→refresh "references" edge must not count.
        #expect(graph.inDegree["refresh"] == 4)
        #expect(graph.outDegree["refresh"] == 1)
        #expect(graph.totalDegree("refresh") == 5)
    }

    @Test func fileCountAndLanguages() throws {
        let graph = try self.loadGraph()
        // auth.ts, proxy.ts, store.ts, misc.ts, auth.test.ts, vendored, README.md
        #expect(graph.fileCount == 7)
        #expect(graph.primaryLanguages.first == "TypeScript")
    }

    // MARK: - Critical path

    @Test func criticalPathExcludesExternalAndVendored() throws {
        let graph = try self.loadGraph()
        let ids = graph.criticalPath(limit: 3).map(\.id)
        #expect(ids.first == "refresh")
        #expect(!ids.contains("foundation"))   // external symbol
        #expect(!ids.contains("vendored"))     // .build/checkouts
        #expect(!ids.contains("readme"))       // not code
        // corelib has the highest raw degree (6 import in-edges) but is an
        // import-hub symbol — must never rank as architecture.
        #expect(!ids.contains("corelib"))
        #expect(!ids.contains("auth_test"))    // test files are not product architecture
    }

    // MARK: - Focused context

    @Test func focusedContextFindsEnclosingNode() throws {
        let graph = try self.loadGraph()
        let context = graph.focusedContext(activeFile: "/Users/x/project/src/auth.ts", cursorLine: 90)
        #expect(context.activeNode?.id == "refresh")
        #expect(context.callers.map(\.id).contains("handler"))
        #expect(context.callees.map(\.id) == ["store"])
        #expect(context.relatedTests.map(\.id) == ["auth_test"])
    }

    @Test func focusedContextFallsBackToFileNode() throws {
        let graph = try self.loadGraph()
        // Cursor above every declaration → the file node itself.
        let context = graph.focusedContext(activeFile: "/Users/x/project/src/auth.ts", cursorLine: 0)
        #expect(context.activeNode?.id == "auth_ts")
    }

    @Test func focusedContextUnknownFileStillGivesCriticalPath() throws {
        let graph = try self.loadGraph()
        let context = graph.focusedContext(activeFile: "/Users/x/project/src/new.ts", cursorLine: 1)
        #expect(context.activeNode == nil)
        #expect(!context.criticalPath.isEmpty)
    }

    // MARK: - Build estimation & partial target (GraphifyRunner pure helpers)

    @Test func buildEstimateUsesMeasuredConstants() {
        // 370 kLOC measured at ~40 s; the estimator must land in that ballpark.
        let large = GraphifyRunner.estimatedBuildSeconds(lineCount: 370_000)
        #expect(large > 30 && large < 60)
        let small = GraphifyRunner.estimatedBuildSeconds(lineCount: 777)
        #expect(small < GraphifyRunner.largeBuildThresholdSeconds)
    }

    @Test func partialTargetPicksBusiestTopLevelDirectory() {
        let target = GraphifyRunner.partialBuildTarget(changedFiles: [
            "packages/proxy/src/a.ts",
            "packages/proxy/src/b.ts",
            "docs/readme.md",
            "Makefile",
        ])
        #expect(target == "packages")
        #expect(GraphifyRunner.partialBuildTarget(changedFiles: ["Makefile"]) == nil)
        #expect(GraphifyRunner.partialBuildTarget(changedFiles: []) == nil)
    }

    // MARK: - Dashboard cache trimming

    @Test func cachePayloadTrimsToProjectStructure() throws {
        let graph = try self.loadGraph(isPartial: true)
        let payload = GraphifyRunner.cachePayload(for: graph)
        #expect(payload.isPartial)
        #expect(payload.partialSubdirectory == "src")
        #expect(payload.totalNodeCount == 10)
        let ids = Set(payload.nodes.map(\.id))
        #expect(!ids.contains("foundation"))
        #expect(!ids.contains("vendored"))
        #expect(!ids.contains("readme"))
        #expect(!ids.contains("corelib"))      // import-hub symbol
        #expect(ids.contains("auth_test"))     // tests stay visible in the dashboard
        // Links must only join kept nodes and stay structural.
        for link in payload.links {
            #expect(ids.contains(link.source) && ids.contains(link.target))
            #expect(link.relation != "references")
        }
        let refresh = payload.nodes.first { $0.id == "refresh" }
        #expect(refresh?.kind == "function")
        #expect(refresh?.inDegree == 4)
    }
}
