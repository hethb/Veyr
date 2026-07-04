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
    }

    public var generatedAt: Date
    public var currentSession: CurrentSession?
    public var budget: Budget
    public var alerts: [Alert]
    public var recommendations: [Recommendation]
    public var agentInstructions: String
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
