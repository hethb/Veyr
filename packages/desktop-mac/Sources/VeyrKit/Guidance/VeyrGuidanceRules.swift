// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// A single agent-guidance rule: a short, actionable instruction injected into
/// CLAUDE.md to steer response behavior (unverified claims, verbosity, etc.).
/// Rule content lives in `~/.veyr/guidance-rules.json`, not in code — edit
/// that file to add, reword, or disable rules without a rebuild.
public struct VeyrGuidanceRule: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var title: String
    public var body: String
    public var enabled: Bool

    public init(id: String, title: String, body: String, enabled: Bool = true) {
        self.id = id
        self.title = title
        self.body = body
        self.enabled = enabled
    }
}

public struct VeyrGuidanceRuleSet: Codable, Equatable, Sendable {
    public var version: Int
    public var rules: [VeyrGuidanceRule]

    public init(version: Int = 1, rules: [VeyrGuidanceRule]) {
        self.version = version
        self.rules = rules
    }
}

/// Loads/saves the editable rule set and renders it into the marker-delimited
/// CLAUDE.md section, using the same mechanics as the spend-status and
/// graph-context sections (VeyrAgentStatusWriter). This only ever writes to
/// the local context file on disk — it never intercepts or rewrites any
/// request or response.
public enum VeyrGuidanceRules {
    public static func fileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.home(base: base).appendingPathComponent("guidance-rules.json")
    }

    /// The starter set. Seeded to disk on first load; after that the file on
    /// disk is the source of truth — edit it directly to iterate on rules.
    public static let defaultRuleSet = VeyrGuidanceRuleSet(rules: [
        VeyrGuidanceRule(
            id: "no-unverified-claims",
            title: "Don't state unverified claims as fact",
            body: "If you haven't checked something — a file's contents, whether a test passes, " +
                "how an API behaves — verify it before asserting it, or say explicitly that it's " +
                "unverified. Don't present a guess as a confirmed fact."),
        VeyrGuidanceRule(
            id: "no-full-restate-before-small-edit",
            title: "Don't restate full context before a small edit",
            body: "Before making a small, targeted change, don't echo the whole file or unchanged " +
                "surrounding code back first. Reference only the specific lines being changed."),
        VeyrGuidanceRule(
            id: "no-acknowledgment-padding",
            title: "Skip acknowledgment boilerplate",
            body: "Don't open responses by restating the task, thanking the user, or narrating what " +
                "you're about to do before doing it. Lead with the substantive content or the action " +
                "itself."),
    ])

    /// Reads `~/.veyr/guidance-rules.json`, seeding it with `defaultRuleSet` on
    /// first run (missing or unparsable file). The file is never overwritten
    /// once it parses successfully, so hand edits persist across ticks.
    @discardableResult
    public static func load(from url: URL = Self.fileURL()) -> VeyrGuidanceRuleSet {
        if let data = try? Data(contentsOf: url),
           let decoded = try? JSONDecoder().decode(VeyrGuidanceRuleSet.self, from: data)
        {
            return decoded
        }
        try? Self.save(Self.defaultRuleSet, to: url)
        return Self.defaultRuleSet
    }

    public static func save(_ ruleSet: VeyrGuidanceRuleSet, to url: URL = Self.fileURL()) throws {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(ruleSet).write(to: url, options: [.atomic])
    }

    /// Renders the enabled rules into the marker-delimited CLAUDE.md section.
    public static func claudeMdSection(_ ruleSet: VeyrGuidanceRuleSet, now: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"

        var lines: [String] = []
        lines.append(VeyrAgentStatusWriter.claudeMdGuidanceSectionBegin)
        lines.append("## Veyr agent guidance")
        lines.append("> Auto-updated by Veyr · \(formatter.string(from: now)) · " +
            "edit ~/.veyr/guidance-rules.json to customize")
        lines.append("")
        let enabled = ruleSet.rules.filter(\.enabled)
        if enabled.isEmpty {
            lines.append("_No active rules._")
        } else {
            for rule in enabled {
                lines.append("- **\(rule.title)** — \(rule.body)")
            }
        }
        lines.append(VeyrAgentStatusWriter.claudeMdGuidanceSectionEnd)
        return lines.joined(separator: "\n")
    }
}
