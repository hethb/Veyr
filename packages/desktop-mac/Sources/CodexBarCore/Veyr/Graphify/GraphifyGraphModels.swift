// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// One node from Graphify's graph.json. Graphify does not emit a node type,
/// docstring, language, or degree — those are all derived on the Veyr side
/// (see `CodebaseGraph.analyze()`), which is why this struct is thinner than
/// the UI models built on top of it.
public struct GraphifyNode: Sendable, Equatable {
    public enum Kind: String, Sendable, Codable {
        case file, function, `class`, symbol
    }

    public let id: String
    public let label: String
    /// Repo-relative path; empty for external symbols (`Foundation`, `String`, …).
    public let sourceFile: String
    /// Parsed from Graphify's "L84" source_location; nil when absent.
    public let line: Int?
    /// code | document | rationale | concept
    public let fileType: String
    public let community: Int?

    public var isExternal: Bool { self.sourceFile.isEmpty }

    /// Derived language from the source file extension; nil for external symbols.
    public var language: String? {
        guard let ext = self.sourceFile.split(separator: ".").last, !self.isExternal else { return nil }
        return Self.languageNames[String(ext).lowercased()]
    }

    static let languageNames: [String: String] = [
        "swift": "Swift", "ts": "TypeScript", "tsx": "TypeScript", "mts": "TypeScript",
        "js": "JavaScript", "jsx": "JavaScript", "mjs": "JavaScript",
        "py": "Python", "go": "Go", "rs": "Rust", "rb": "Ruby", "java": "Java",
        "c": "C", "h": "C", "cc": "C++", "cpp": "C++", "hpp": "C++",
        "cs": "C#", "kt": "Kotlin", "php": "PHP", "scala": "Scala",
    ]
}

public struct GraphifyLink: Sendable, Equatable {
    public let source: String
    public let target: String
    /// calls | imports | imports_from | inherits | implements | method | contains
    /// | defines | references | case_of | indirect_call | rationale_for
    public let relation: String
    /// EXTRACTED | INFERRED | AMBIGUOUS
    public let confidence: String

    /// Relations that describe code structure. `references` (36% of all edges in
    /// testing) and prose relations are excluded from degree so G1/G2 connectivity
    /// rules measure architecture, not mention frequency.
    public static let structuralRelations: Set<String> = [
        "calls", "imports", "imports_from", "inherits", "implements",
        "method", "contains", "defines", "indirect_call", "case_of",
    ]

    public var isStructural: Bool { Self.structuralRelations.contains(self.relation) }
}

/// A loaded, analyzed Graphify graph plus the Veyr-level metadata Graphify
/// doesn't track (partial flag, workspace, versions).
public struct CodebaseGraph: Sendable {
    public let nodes: [GraphifyNode]
    public let links: [GraphifyLink]
    public let workspaceRoot: String
    public let generatedAt: Date
    public let graphifyVersion: String
    public let builtAtCommit: String?
    /// True when built from a subdirectory while the full build runs.
    public let isPartial: Bool
    /// The subdirectory a partial graph covers, nil for full graphs.
    public let partialSubdirectory: String?

    // Derived once at load (see analyze()):
    public let fileCount: Int
    public let primaryLanguages: [String]
    /// Structural in/out degree per node id (references edges excluded).
    public let inDegree: [String: Int]
    public let outDegree: [String: Int]
    /// Node kind per id — Graphify doesn't emit one; derived from label shape,
    /// file basename match, and inherits/implements/method edge participation.
    public let kinds: [String: GraphifyNode.Kind]

    public func totalDegree(_ id: String) -> Int {
        (self.inDegree[id] ?? 0) + (self.outDegree[id] ?? 0)
    }

    public func node(id: String) -> GraphifyNode? {
        self.nodesByID[id]
    }

    private let nodesByID: [String: GraphifyNode]

    public init(
        nodes: [GraphifyNode],
        links: [GraphifyLink],
        workspaceRoot: String,
        generatedAt: Date,
        graphifyVersion: String,
        builtAtCommit: String?,
        isPartial: Bool,
        partialSubdirectory: String?)
    {
        self.nodes = nodes
        self.links = links
        self.workspaceRoot = workspaceRoot
        self.generatedAt = generatedAt
        self.graphifyVersion = graphifyVersion
        self.builtAtCommit = builtAtCommit
        self.isPartial = isPartial
        self.partialSubdirectory = partialSubdirectory

        let analysis = Self.analyze(nodes: nodes, links: links)
        self.fileCount = analysis.fileCount
        self.primaryLanguages = analysis.primaryLanguages
        self.inDegree = analysis.inDegree
        self.outDegree = analysis.outDegree
        self.kinds = analysis.kinds
        self.nodesByID = Dictionary(nodes.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    struct Analysis {
        let fileCount: Int
        let primaryLanguages: [String]
        let inDegree: [String: Int]
        let outDegree: [String: Int]
        let kinds: [String: GraphifyNode.Kind]
    }

    static func analyze(nodes: [GraphifyNode], links: [GraphifyLink]) -> Analysis {
        var inDegree: [String: Int] = [:]
        var outDegree: [String: Int] = [:]
        var methodSources = Set<String>()
        var inheritanceTargets = Set<String>()
        for link in links where link.isStructural {
            outDegree[link.source, default: 0] += 1
            inDegree[link.target, default: 0] += 1
            if link.relation == "method" { methodSources.insert(link.source) }
            if link.relation == "inherits" || link.relation == "implements" {
                inheritanceTargets.insert(link.target)
            }
        }

        var kinds: [String: GraphifyNode.Kind] = [:]
        var files = Set<String>()
        var languageCounts: [String: Int] = [:]
        for node in nodes {
            if !node.sourceFile.isEmpty {
                files.insert(node.sourceFile)
                // Vendored checkouts stay out of the language stats or a single
                // dependency (BoringSSL) makes a Swift app read as a C++ project.
                if let language = node.language, !Self.isVendoredPath(node.sourceFile) {
                    languageCounts[language, default: 0] += 1
                }
            }
            kinds[node.id] = Self.kind(
                of: node,
                hasMethods: methodSources.contains(node.id),
                isInheritedFrom: inheritanceTargets.contains(node.id))
        }

        let primary = languageCounts.sorted { $0.value > $1.value }.prefix(3).map(\.key)
        return Analysis(
            fileCount: files.count,
            primaryLanguages: Array(primary),
            inDegree: inDegree,
            outDegree: outDegree,
            kinds: kinds)
    }

    static func kind(of node: GraphifyNode, hasMethods: Bool, isInheritedFrom: Bool) -> GraphifyNode.Kind {
        if node.label.hasSuffix("()") { return .function }
        let basename = node.sourceFile.split(separator: "/").last.map(String.init) ?? ""
        if !basename.isEmpty, basename == node.label { return .file }
        if hasMethods || isInheritedFrom { return .class }
        return .symbol
    }

    /// Highest-impact project nodes: top structural degree. Excludes vendored and
    /// test paths, and `symbol`-kind nodes — imported module names (`Foundation`,
    /// `Testing`, …) get a source_file from wherever Graphify first saw them, so an
    /// emptiness check alone does not keep them out, but they always derive as
    /// `symbol` (no `()` label, no basename match, no methods/inheritance).
    public func criticalPath(limit: Int = 10) -> [GraphifyNode] {
        self.nodes
            .filter { node in
                !node.isExternal
                    && node.fileType == "code"
                    && self.kinds[node.id] != .symbol
                    && !Self.isVendoredPath(node.sourceFile)
                    && !Self.looksLikeTest(node)
            }
            .sorted { self.totalDegree($0.id) > self.totalDegree($1.id) }
            .prefix(limit)
            .map { $0 }
    }

    static func isVendoredPath(_ path: String) -> Bool {
        let lowered = path.lowercased()
        return lowered.contains("/.build/") || lowered.hasPrefix(".build/")
            || lowered.contains("/vendored/") || lowered.contains("/vendor/")
            || lowered.contains("/node_modules/") || lowered.contains("/checkouts/")
    }
}

// MARK: - Focused context

public struct FocusedContext: Sendable {
    public let activeNode: GraphifyNode?
    public let callers: [GraphifyNode]
    public let callees: [GraphifyNode]
    public let importedBy: [GraphifyNode]
    public let imports: [GraphifyNode]
    public let criticalPath: [GraphifyNode]
    public let relatedTests: [GraphifyNode]

    public static let empty = FocusedContext(
        activeNode: nil, callers: [], callees: [],
        importedBy: [], imports: [], criticalPath: [], relatedTests: [])
}

extension CodebaseGraph {
    public func focusedContext(activeFile: String, cursorLine: Int) -> FocusedContext {
        // Nearest node at or above the cursor in the active file — matches how a
        // reader attributes a cursor position to the enclosing declaration.
        let inFile = self.nodes.filter { !$0.sourceFile.isEmpty && activeFile.hasSuffix($0.sourceFile) }
        let activeNode = inFile
            .filter { ($0.line ?? Int.max) <= cursorLine }
            .max { ($0.line ?? 0) < ($1.line ?? 0) }
            ?? inFile.first { self.kinds[$0.id] == .file }

        guard let active = activeNode else {
            return FocusedContext(
                activeNode: nil, callers: [], callees: [], importedBy: [], imports: [],
                criticalPath: self.criticalPath(), relatedTests: [])
        }

        var callers: [GraphifyNode] = []
        var callees: [GraphifyNode] = []
        var importedBy: [GraphifyNode] = []
        var imports: [GraphifyNode] = []
        var neighborIDs = Set<String>()
        let callRelations: Set<String> = ["calls", "indirect_call"]
        let importRelations: Set<String> = ["imports", "imports_from"]
        for link in self.links {
            if callRelations.contains(link.relation) {
                if link.target == active.id, let node = self.node(id: link.source) {
                    callers.append(node); neighborIDs.insert(node.id)
                } else if link.source == active.id, let node = self.node(id: link.target) {
                    callees.append(node); neighborIDs.insert(node.id)
                }
            } else if importRelations.contains(link.relation) {
                if link.target == active.id, let node = self.node(id: link.source) {
                    importedBy.append(node); neighborIDs.insert(node.id)
                } else if link.source == active.id, let node = self.node(id: link.target) {
                    imports.append(node); neighborIDs.insert(node.id)
                }
            }
        }

        let relatedTests = self.nodes.filter { node in
            neighborIDs.contains(node.id) && Self.looksLikeTest(node)
        }

        return FocusedContext(
            activeNode: active,
            callers: Array(callers.prefix(10)),
            callees: Array(callees.prefix(10)),
            importedBy: Array(importedBy.prefix(5)),
            imports: Array(imports.prefix(5)),
            criticalPath: self.criticalPath(),
            relatedTests: Array(relatedTests.prefix(5)))
    }

    static func looksLikeTest(_ node: GraphifyNode) -> Bool {
        let file = node.sourceFile.lowercased()
        return file.contains("test") || file.contains("spec")
            || node.label.lowercased().hasPrefix("test")
    }
}

// MARK: - graph.json decoding

/// Decodes Graphify's NetworkX node-link graph.json. Field names and shapes are
/// documented in GRAPHIFY_INTEGRATION.md and verified against a real build; the
/// edges key is "links" and line numbers arrive as "L84" strings.
public enum GraphifyGraphFile {
    struct Raw: Decodable {
        struct RawNode: Decodable {
            let id: String
            let label: String?
            let source_file: String?
            let source_location: String?
            let file_type: String?
            let community: Int?
        }

        struct RawLink: Decodable {
            let source: String
            let target: String
            let relation: String?
            let confidence: String?
        }

        let nodes: [RawNode]
        let links: [RawLink]
        let built_at_commit: String?
    }

    public struct Contents: Sendable {
        public let nodes: [GraphifyNode]
        public let links: [GraphifyLink]
        public let builtAtCommit: String?
    }

    public static func decode(_ data: Data) throws -> Contents {
        let raw = try JSONDecoder().decode(Raw.self, from: data)
        let nodes = raw.nodes.map { node in
            GraphifyNode(
                id: node.id,
                label: node.label ?? node.id,
                sourceFile: node.source_file ?? "",
                line: Self.parseLine(node.source_location),
                fileType: node.file_type ?? "code",
                community: node.community)
        }
        let links = raw.links.map { link in
            GraphifyLink(
                source: link.source,
                target: link.target,
                relation: link.relation ?? "references",
                confidence: link.confidence ?? "EXTRACTED")
        }
        return Contents(nodes: nodes, links: links, builtAtCommit: raw.built_at_commit)
    }

    /// "L84" → 84
    package static func parseLine(_ location: String?) -> Int? {
        guard let location, location.hasPrefix("L") else { return nil }
        return Int(location.dropFirst())
    }
}
