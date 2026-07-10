// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Turns a built CodebaseGraph + focus into the compressed summaries that ship
/// to agents: the graphContext block of VEYR_STATUS.json (3a) and the
/// marker-delimited CLAUDE.md graph section (3b). Pure — no I/O.
public enum VeyrGraphContextBuilder {
    /// The point of the whole feature: an agent reading this summary instead of
    /// exploring the codebase file-by-file. Exploration cost scales with repo
    /// size; the summary is a few hundred tokens regardless.
    static let summaryTokens = 400

    public static func exploreTokens(fileCount: Int) -> Int {
        fileCount < 50 ? 2000 : fileCount < 200 ? 4000 : 8000
    }

    // MARK: - 3a: VEYR_STATUS.json graphContext

    public static func build(
        graph: CodebaseGraph,
        focused: FocusedContext,
        monthlySessionCount: Int) -> VeyrAgentStatusPayload.GraphContext
    {
        let withoutGraph = Self.exploreTokens(fileCount: graph.fileCount)
        let perSession = max(0, withoutGraph - Self.summaryTokens)
        let savings = VeyrAgentStatusPayload.GraphContext.TokenSavingsEstimate(
            withoutGraph: withoutGraph,
            withGraph: Self.summaryTokens,
            savingsThisSession: perSession,
            savingsThisMonth: perSession * max(0, monthlySessionCount))

        return VeyrAgentStatusPayload.GraphContext(
            available: true,
            isPartial: graph.isPartial,
            partialNote: graph.isPartial
                ? "Full graph building in background — this is based on recently modified files only."
                : nil,
            graphifyVersion: graph.graphifyVersion,
            fileCount: graph.fileCount,
            nodeCount: graph.nodes.count,
            edgeCount: graph.links.count,
            lastBuiltAt: graph.generatedAt,
            primaryLanguages: graph.primaryLanguages,
            architecturalOverview: Self.architecturalOverview(graph: graph, focused: focused),
            activeFileSummary: focused.activeNode.map { Self.activeSummary($0, graph: graph, focused: focused) },
            criticalPath: focused.criticalPath.prefix(10).map { node in
                .init(
                    name: node.label,
                    file: node.sourceFile,
                    line: node.line,
                    connections: graph.totalDegree(node.id))
            },
            tokenSavingsEstimate: savings)
    }

    static func activeSummary(
        _ node: GraphifyNode,
        graph: CodebaseGraph,
        focused: FocusedContext) -> VeyrAgentStatusPayload.GraphContext.ActiveFileSummary
    {
        .init(
            name: node.label,
            file: node.sourceFile,
            line: node.line,
            kind: (graph.kinds[node.id] ?? .symbol).rawValue,
            connections: graph.totalDegree(node.id),
            callers: focused.callers.map(\.label),
            callees: focused.callees.map(\.label),
            imports: focused.imports.map(\.label),
            importedBy: focused.importedBy.map(\.label),
            tests: focused.relatedTests.map(\.label))
    }

    static func architecturalOverview(graph: CodebaseGraph, focused: FocusedContext) -> String {
        let communityCount = Set(graph.nodes.compactMap(\.community)).count
        let languages = graph.primaryLanguages.isEmpty
            ? "" : " Primary languages: \(graph.primaryLanguages.joined(separator: ", "))."
        let hubs = focused.criticalPath.prefix(3).map(\.label).joined(separator: ", ")
        let hubSentence = hubs.isEmpty ? "" : " Highest-impact code: \(hubs)."
        return "\(graph.fileCount) files, \(graph.nodes.count) symbols in " +
            "\(communityCount) communities.\(languages)\(hubSentence)"
    }

    // MARK: - 3b: CLAUDE.md graph section

    public static func claudeMdGraphSection(
        graph: CodebaseGraph,
        focused: FocusedContext,
        context: VeyrAgentStatusPayload.GraphContext,
        now: Date = Date()) -> String
    {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"

        var lines: [String] = []
        lines.append(VeyrAgentStatusWriter.claudeMdGraphSectionBegin)
        lines.append("## Veyr codebase graph")
        lines.append("> Powered by Graphify · \(graph.isPartial ? "Partial graph" : "Full graph") · " +
            formatter.string(from: now))
        if graph.isPartial {
            lines.append("> ⚠️ Partial graph (full build in progress)")
        }
        lines.append("")
        lines.append("### Architecture")
        lines.append(context.architecturalOverview)
        lines.append("")

        if let node = focused.activeNode {
            let location = node.line.map { "\(node.sourceFile):\($0)" } ?? node.sourceFile
            lines.append("### Active context: \(node.label) (\(location))")
            if !focused.callers.isEmpty {
                lines.append("**Called by:** \(focused.callers.map(\.label).joined(separator: ", "))")
            }
            if !focused.callees.isEmpty {
                lines.append("**Calls:** \(focused.callees.map(\.label).joined(separator: ", "))")
            }
            if !focused.imports.isEmpty {
                lines.append("**Imports:** \(focused.imports.map(\.label).joined(separator: ", "))")
            }
            if !focused.importedBy.isEmpty {
                lines.append("**Imported by:** \(focused.importedBy.map(\.label).joined(separator: ", "))")
            }
            if !focused.relatedTests.isEmpty {
                lines.append("**Tests:** \(focused.relatedTests.map(\.label).joined(separator: ", "))")
            }
            lines.append("")
            let degree = graph.totalDegree(node.id)
            let kind = graph.kinds[node.id]
            if kind == .function, degree <= 2 {
                lines.append("⚡ **Leaf function** (low connectivity) — consider claude-haiku-4-5 for this task")
                lines.append("")
            } else if degree > 20, kind == .function || kind == .class {
                lines.append("⚠️ **High-impact node** (\(degree) connections) — changes ripple widely")
                lines.append("")
            }
        }

        if !focused.criticalPath.isEmpty {
            lines.append("### Critical path (highest-impact files)")
            for node in focused.criticalPath.prefix(5) {
                lines.append("- **\(node.label)** (\(node.sourceFile)) — " +
                    "\(graph.totalDegree(node.id)) connections")
            }
            lines.append("")
        }

        lines.append("### Token savings")
        lines.append("Reading this summary saves ~\(context.tokenSavingsEstimate.savingsThisSession) " +
            "tokens vs. exploring files manually.")
        lines.append(VeyrAgentStatusWriter.claudeMdGraphSectionEnd)
        return lines.joined(separator: "\n")
    }
}
