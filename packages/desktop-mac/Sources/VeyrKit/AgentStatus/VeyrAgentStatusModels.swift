// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// The machine-readable feed at `~/.veyr/agent-status/VEYR_STATUS.json`.
/// Encoded with snake_case keys — this is the contract coding agents read.
public struct VeyrAgentStatusPayload: Codable, Equatable, Sendable {
    public struct CurrentSession: Codable, Equatable, Sendable {
        public var provider: String
        public var model: String
        public var project: String
        public var sessionCostUsd: Double
        public var inputTokens: Int
        public var outputTokens: Int
        public var cacheReadTokens: Int
        public var cacheHitRate: Double
        public var sessionDurationMinutes: Double
        public var costPerMinute: Double
        public var isActive: Bool
    }

    public struct Budget: Codable, Equatable, Sendable {
        public var projectMonthlyCapUsd: Double?
        public var projectSpentThisMonthUsd: Double
        public var projectRemainingUsd: Double?
        public var projectPctUsed: Int?
        public var globalMonthlyCapUsd: Double?
        public var globalSpentThisMonthUsd: Double
        public var globalRemainingUsd: Double?
        public var globalPctUsed: Int?
    }

    public struct Alert: Codable, Equatable, Sendable {
        public var level: String // "warning" | "critical"
        public var message: String
    }

    public struct Recommendation: Codable, Equatable, Sendable {
        public var id: String
        public var priority: String // "high" | "medium" | "low"
        public var action: String // "switch_model" | "compact_context" | ...
        public var suggestedModel: String?
        public var reason: String
        public var estimatedSavingsPerHourUsd: Double
        /// Populated for output-constraint recommendations (rules 5/11).
        public var avgOutputTokens: Int?

        public init(
            id: String,
            priority: String,
            action: String,
            suggestedModel: String? = nil,
            reason: String,
            estimatedSavingsPerHourUsd: Double,
            avgOutputTokens: Int? = nil)
        {
            self.id = id
            self.priority = priority
            self.action = action
            self.suggestedModel = suggestedModel
            self.reason = reason
            self.estimatedSavingsPerHourUsd = estimatedSavingsPerHourUsd
            self.avgOutputTokens = avgOutputTokens
        }
    }

    public struct ComplexityAnalysis: Codable, Equatable, Sendable {
        public var classifierEnabled: Bool
        public var classifiedTurnsThisMonth: Int
        public var simpleOnFrontierPct: Int
        public var wastedCostThisMonthUsd: Double

        public init(
            classifierEnabled: Bool,
            classifiedTurnsThisMonth: Int,
            simpleOnFrontierPct: Int,
            wastedCostThisMonthUsd: Double)
        {
            self.classifierEnabled = classifierEnabled
            self.classifiedTurnsThisMonth = classifiedTurnsThisMonth
            self.simpleOnFrontierPct = simpleOnFrontierPct
            self.wastedCostThisMonthUsd = wastedCostThisMonthUsd
        }
    }

    public struct ToolAnalysis: Codable, Equatable, Sendable {
        /// Approximation: distinct tools *called* across the tag (definitions
        /// aren't logged), standing in for "loaded".
        public var toolsLoaded: Int
        public var toolsUsed: Int
        public var unusedToolTokenEstimate: Int
        public var unusedToolCostThisSession: Double

        public init(
            toolsLoaded: Int, toolsUsed: Int,
            unusedToolTokenEstimate: Int, unusedToolCostThisSession: Double)
        {
            self.toolsLoaded = toolsLoaded
            self.toolsUsed = toolsUsed
            self.unusedToolTokenEstimate = unusedToolTokenEstimate
            self.unusedToolCostThisSession = unusedToolCostThisSession
        }
    }

    public struct FlaggedTool: Codable, Equatable, Sendable {
        public var name: String
        public var issue: String
        public var suggestion: String

        public init(name: String, issue: String, suggestion: String) {
            self.name = name
            self.issue = issue
            self.suggestion = suggestion
        }
    }

    public struct ToolQuality: Codable, Equatable, Sendable {
        public var analyzed: Bool
        public var totalTools: Int
        public var flaggedTools: [FlaggedTool]

        public init(analyzed: Bool, totalTools: Int, flaggedTools: [FlaggedTool]) {
            self.analyzed = analyzed
            self.totalTools = totalTools
            self.flaggedTools = flaggedTools
        }
    }

    /// Compressed Graphify summary (Part 3a). Only derived fields — the raw
    /// graph lives in ~/.veyr/cache/graph.json, never here.
    public struct GraphContext: Codable, Equatable, Sendable {
        public struct NodeRef: Codable, Equatable, Sendable {
            public var name: String
            public var file: String
            public var line: Int?
            public var connections: Int

            public init(name: String, file: String, line: Int?, connections: Int) {
                self.name = name
                self.file = file
                self.line = line
                self.connections = connections
            }
        }

        public struct ActiveFileSummary: Codable, Equatable, Sendable {
            public var name: String
            public var file: String
            public var line: Int?
            public var kind: String
            public var connections: Int
            public var callers: [String]
            public var callees: [String]
            public var imports: [String]
            public var importedBy: [String]
            public var tests: [String]

            public init(
                name: String, file: String, line: Int?, kind: String, connections: Int,
                callers: [String], callees: [String], imports: [String],
                importedBy: [String], tests: [String])
            {
                self.name = name
                self.file = file
                self.line = line
                self.kind = kind
                self.connections = connections
                self.callers = callers
                self.callees = callees
                self.imports = imports
                self.importedBy = importedBy
                self.tests = tests
            }
        }

        public struct TokenSavingsEstimate: Codable, Equatable, Sendable {
            public var withoutGraph: Int
            public var withGraph: Int
            public var savingsThisSession: Int
            public var savingsThisMonth: Int

            public init(withoutGraph: Int, withGraph: Int, savingsThisSession: Int, savingsThisMonth: Int) {
                self.withoutGraph = withoutGraph
                self.withGraph = withGraph
                self.savingsThisSession = savingsThisSession
                self.savingsThisMonth = savingsThisMonth
            }
        }

        public var available: Bool
        public var isPartial: Bool
        /// Present only when isPartial — explains the reduced scope.
        public var partialNote: String?
        public var graphifyVersion: String
        public var fileCount: Int
        public var nodeCount: Int
        public var edgeCount: Int
        public var lastBuiltAt: Date
        public var primaryLanguages: [String]
        public var architecturalOverview: String
        public var activeFileSummary: ActiveFileSummary?
        public var criticalPath: [NodeRef]
        public var tokenSavingsEstimate: TokenSavingsEstimate

        public init(
            available: Bool,
            isPartial: Bool,
            partialNote: String? = nil,
            graphifyVersion: String,
            fileCount: Int,
            nodeCount: Int,
            edgeCount: Int,
            lastBuiltAt: Date,
            primaryLanguages: [String],
            architecturalOverview: String,
            activeFileSummary: ActiveFileSummary? = nil,
            criticalPath: [NodeRef],
            tokenSavingsEstimate: TokenSavingsEstimate)
        {
            self.available = available
            self.isPartial = isPartial
            self.partialNote = partialNote
            self.graphifyVersion = graphifyVersion
            self.fileCount = fileCount
            self.nodeCount = nodeCount
            self.edgeCount = edgeCount
            self.lastBuiltAt = lastBuiltAt
            self.primaryLanguages = primaryLanguages
            self.architecturalOverview = architecturalOverview
            self.activeFileSummary = activeFileSummary
            self.criticalPath = criticalPath
            self.tokenSavingsEstimate = tokenSavingsEstimate
        }
    }

    public var generatedAt: Date
    /// Today's total spend across all sessions — lets clients (VS Code status
    /// bar) show something useful even when no session is active.
    public var todaySpentUsd: Double
    public var currentSession: CurrentSession?
    public var budget: Budget
    public var alerts: [Alert]
    public var recommendations: [Recommendation]
    public var agentInstructions: String
    public var complexity: ComplexityAnalysis?
    public var toolAnalysis: ToolAnalysis?
    public var toolQuality: ToolQuality?
    public var graphContext: GraphContext?
}

/// `~/.veyr/budget-controls.json` (camelCase keys, per the controls-file contract).
public struct VeyrBudgetControls: Codable, Equatable, Sendable {
    public struct TagBudget: Codable, Equatable, Sendable {
        public var monthlyCapUSD: Double
        public var alertAt80Pct: Bool

        public init(monthlyCapUSD: Double, alertAt80Pct: Bool = true) {
            self.monthlyCapUSD = monthlyCapUSD
            self.alertAt80Pct = alertAt80Pct
        }
    }

    public var globalMonthlyCapUSD: Double?
    public var perTag: [String: TagBudget]

    public init(globalMonthlyCapUSD: Double? = nil, perTag: [String: TagBudget] = [:]) {
        self.globalMonthlyCapUSD = globalMonthlyCapUSD
        self.perTag = perTag
    }

    public static func load(from url: URL = VeyrPaths.budgetControlsFile()) -> VeyrBudgetControls {
        guard let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(VeyrBudgetControls.self, from: data)
        else { return VeyrBudgetControls() }
        return decoded
    }

    public func save(to url: URL = VeyrPaths.budgetControlsFile()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: url, options: [.atomic])
    }
}

/// `~/.veyr/agent-status/VEYR_OVERRIDES.json` — human overrides from the UI,
/// snake_case so agents can read it alongside VEYR_STATUS.json.
public struct VeyrOverrides: Codable, Equatable, Sendable {
    public var forceModel: String?
    public var sessionBudgetCapUsd: Double?
    public var autoCompactAboveTokens: Int?

    public init(
        forceModel: String? = nil,
        sessionBudgetCapUsd: Double? = nil,
        autoCompactAboveTokens: Int? = nil)
    {
        self.forceModel = forceModel
        self.sessionBudgetCapUsd = sessionBudgetCapUsd
        self.autoCompactAboveTokens = autoCompactAboveTokens
    }

    public static func agentStatusFileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.agentStatusDirectory(base: base).appendingPathComponent("VEYR_OVERRIDES.json")
    }

    public static func load(from url: URL = Self.agentStatusFileURL()) -> VeyrOverrides {
        guard let data = try? Data(contentsOf: url) else { return VeyrOverrides() }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return (try? decoder.decode(VeyrOverrides.self, from: data)) ?? VeyrOverrides()
    }

    public func save(to url: URL = Self.agentStatusFileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(self).write(to: url, options: [.atomic])
    }
}
