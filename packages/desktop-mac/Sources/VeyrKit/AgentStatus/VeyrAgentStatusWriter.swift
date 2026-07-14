// Veyr — original code
// https://github.com/hethb/Veyr
// SPDX-License-Identifier: MIT
// Copyright (c) 2025 Heth Bhatt
import Foundation

/// Writes the agent-status files under `~/.veyr/agent-status/` and manages the
/// opt-in CLAUDE.md spend-status section.
public enum VeyrAgentStatusWriter {
    public static func statusFileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.agentStatusDirectory(base: base).appendingPathComponent("VEYR_STATUS.json")
    }

    public static func markdownFileURL(
        base: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL
    {
        VeyrPaths.agentStatusDirectory(base: base).appendingPathComponent("VEYR_PROJECT_STATUS.md")
    }

    /// Writes VEYR_STATUS.json and VEYR_PROJECT_STATUS.md atomically.
    public static func write(
        payload: VeyrAgentStatusPayload,
        base: URL = FileManager.default.homeDirectoryForCurrentUser) throws
    {
        let directory = VeyrPaths.agentStatusDirectory(base: base)
        VeyrPaths.ensureDirectoryExists(directory)

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let statusURL = Self.statusFileURL(base: base)
        try encoder.encode(payload).write(to: statusURL, options: [.atomic])

        let markdown = VeyrAgentStatusBuilder.markdown(payload: payload)
        let markdownURL = Self.markdownFileURL(base: base)
        try Data(markdown.utf8).write(to: markdownURL, options: [.atomic])

        // Any process (Claude Code, scripts, other agents) must be able to read these.
        for url in [statusURL, markdownURL] {
            try? FileManager.default.setAttributes(
                [.posixPermissions: 0o644], ofItemAtPath: url.path)
        }
    }

    // MARK: - CLAUDE.md injection (opt-in)

    static let claudeMdSectionBegin = "<!-- veyr:spend-status:begin -->"
    static let claudeMdSectionEnd = "<!-- veyr:spend-status:end -->"
    public static let claudeMdGraphSectionBegin = "<!-- veyr:graph-context:begin -->"
    public static let claudeMdGraphSectionEnd = "<!-- veyr:graph-context:end -->"

    /// Replaces (or appends) the managed `## Veyr spend status` section in the
    /// CLAUDE.md at `projectPath`. Creates CLAUDE.md only if `createIfMissing`.
    /// Returns true if the file was written.
    @discardableResult
    public static func updateClaudeMd(
        projectPath: String,
        payload: VeyrAgentStatusPayload,
        createIfMissing: Bool = false,
        fileManager: FileManager = .default) throws -> Bool
    {
        let claudeMdURL = URL(fileURLWithPath: projectPath).appendingPathComponent("CLAUDE.md")
        let exists = fileManager.fileExists(atPath: claudeMdURL.path)
        guard exists || createIfMissing else { return false }

        let existing = exists ? (try? String(contentsOf: claudeMdURL, encoding: .utf8)) ?? "" : ""
        let section = Self.claudeMdSection(payload: payload)
        let updated = Self.replacingManagedSection(in: existing, with: section)
        guard updated != existing else { return false }
        try Data(updated.utf8).write(to: claudeMdURL, options: [.atomic])
        return true
    }

    /// Removes the managed section entirely (used when the user turns the setting off).
    @discardableResult
    public static func removeClaudeMdSection(
        projectPath: String,
        fileManager: FileManager = .default) throws -> Bool
    {
        let claudeMdURL = URL(fileURLWithPath: projectPath).appendingPathComponent("CLAUDE.md")
        guard fileManager.fileExists(atPath: claudeMdURL.path),
              let existing = try? String(contentsOf: claudeMdURL, encoding: .utf8),
              existing.contains(Self.claudeMdSectionBegin)
        else { return false }
        let cleaned = Self.replacingManagedSection(in: existing, with: nil)
        try Data(cleaned.utf8).write(to: claudeMdURL, options: [.atomic])
        return true
    }

    // MARK: - CLAUDE.md graph section (Part 3b — same mechanics, separate markers)

    /// Replaces (or appends) the managed `## Veyr codebase graph` section. The
    /// section string must already carry the graph markers (see
    /// VeyrGraphContextBuilder.claudeMdGraphSection). Returns true if written.
    @discardableResult
    public static func updateClaudeMdGraphSection(
        projectPath: String,
        section: String,
        createIfMissing: Bool = false,
        fileManager: FileManager = .default) throws -> Bool
    {
        let claudeMdURL = URL(fileURLWithPath: projectPath).appendingPathComponent("CLAUDE.md")
        let exists = fileManager.fileExists(atPath: claudeMdURL.path)
        guard exists || createIfMissing else { return false }

        let existing = exists ? (try? String(contentsOf: claudeMdURL, encoding: .utf8)) ?? "" : ""
        let updated = Self.replacingManagedSection(
            in: existing, with: section,
            begin: Self.claudeMdGraphSectionBegin, end: Self.claudeMdGraphSectionEnd)
        guard updated != existing else { return false }
        try Data(updated.utf8).write(to: claudeMdURL, options: [.atomic])
        return true
    }

    @discardableResult
    public static func removeClaudeMdGraphSection(
        projectPath: String,
        fileManager: FileManager = .default) throws -> Bool
    {
        let claudeMdURL = URL(fileURLWithPath: projectPath).appendingPathComponent("CLAUDE.md")
        guard fileManager.fileExists(atPath: claudeMdURL.path),
              let existing = try? String(contentsOf: claudeMdURL, encoding: .utf8),
              existing.contains(Self.claudeMdGraphSectionBegin)
        else { return false }
        let cleaned = Self.replacingManagedSection(
            in: existing, with: nil,
            begin: Self.claudeMdGraphSectionBegin, end: Self.claudeMdGraphSectionEnd)
        try Data(cleaned.utf8).write(to: claudeMdURL, options: [.atomic])
        return true
    }

    // MARK: - CLAUDE.md guidance section (behavior rules, same mechanics, separate markers)

    public static let claudeMdGuidanceSectionBegin = "<!-- veyr:guidance:begin -->"
    public static let claudeMdGuidanceSectionEnd = "<!-- veyr:guidance:end -->"

    /// Replaces (or appends) the managed `## Veyr agent guidance` section. The
    /// section string must already carry the guidance markers (see
    /// VeyrGuidanceRules.claudeMdSection). Opt-in and off by default — this
    /// only ever writes the local context file, never request/response traffic.
    @discardableResult
    public static func updateClaudeMdGuidanceSection(
        projectPath: String,
        section: String,
        createIfMissing: Bool = false,
        fileManager: FileManager = .default) throws -> Bool
    {
        let claudeMdURL = URL(fileURLWithPath: projectPath).appendingPathComponent("CLAUDE.md")
        let exists = fileManager.fileExists(atPath: claudeMdURL.path)
        guard exists || createIfMissing else { return false }

        let existing = exists ? (try? String(contentsOf: claudeMdURL, encoding: .utf8)) ?? "" : ""
        let updated = Self.replacingManagedSection(
            in: existing, with: section,
            begin: Self.claudeMdGuidanceSectionBegin, end: Self.claudeMdGuidanceSectionEnd)
        guard updated != existing else { return false }
        try Data(updated.utf8).write(to: claudeMdURL, options: [.atomic])
        return true
    }

    @discardableResult
    public static func removeClaudeMdGuidanceSection(
        projectPath: String,
        fileManager: FileManager = .default) throws -> Bool
    {
        let claudeMdURL = URL(fileURLWithPath: projectPath).appendingPathComponent("CLAUDE.md")
        guard fileManager.fileExists(atPath: claudeMdURL.path),
              let existing = try? String(contentsOf: claudeMdURL, encoding: .utf8),
              existing.contains(Self.claudeMdGuidanceSectionBegin)
        else { return false }
        let cleaned = Self.replacingManagedSection(
            in: existing, with: nil,
            begin: Self.claudeMdGuidanceSectionBegin, end: Self.claudeMdGuidanceSectionEnd)
        try Data(cleaned.utf8).write(to: claudeMdURL, options: [.atomic])
        return true
    }

    static func claudeMdSection(payload: VeyrAgentStatusPayload, now: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"

        var lines: [String] = []
        lines.append(Self.claudeMdSectionBegin)
        lines.append("## Veyr spend status")
        lines.append("> Auto-updated by Veyr · \(formatter.string(from: now)) · disable in Veyr settings")
        lines.append("")
        if let session = payload.currentSession {
            lines.append("**Current session:** \(session.model) · " +
                String(format: "$%.4f", session.sessionCostUsd) + "/session · " +
                String(format: "$%.4f", session.costPerMinute) + "/min")
            lines.append("**Cache hit rate:** \(Int((session.cacheHitRate * 100).rounded()))%")
            if let pct = payload.budget.projectPctUsed,
               let cap = payload.budget.projectMonthlyCapUsd
            {
                lines.append("**Budget:** \(session.project) at \(pct)% of " +
                    String(format: "$%.0f", cap) + "/mo")
            }
        }
        let recommendations = payload.recommendations.prefix(3)
        if !recommendations.isEmpty {
            lines.append("")
            lines.append("**Recommendations:**")
            for rec in recommendations {
                let title: String = switch rec.action {
                case "switch_model": "Switch to \(rec.suggestedModel ?? "a smaller model")"
                case "compact_context": "Run /compact"
                case "enable_caching": "Stabilize system prompts for caching"
                case "add_output_constraints": "Constrain response length"
                default: rec.action.replacingOccurrences(of: "_", with: " ")
                }
                lines.append("- \(title) — \(rec.reason)")
            }
        }
        lines.append("")
        lines.append("**Agent instructions:** \(payload.agentInstructions)")
        lines.append(Self.claudeMdSectionEnd)
        return lines.joined(separator: "\n")
    }

    /// Replaces the marker-delimited section, or appends it at the bottom.
    /// Passing nil removes the section. Marker pair defaults to the spend
    /// section; the graph section passes its own markers.
    static func replacingManagedSection(
        in content: String,
        with section: String?,
        begin: String = Self.claudeMdSectionBegin,
        end: String = Self.claudeMdSectionEnd) -> String
    {
        if let beginRange = content.range(of: begin),
           let endRange = content.range(of: end, range: beginRange.upperBound..<content.endIndex)
        {
            var replaced = content
            let fullRange = beginRange.lowerBound..<endRange.upperBound
            if let section {
                replaced.replaceSubrange(fullRange, with: section)
            } else {
                // Also swallow one trailing newline pair the section brought along.
                var removalEnd = endRange.upperBound
                while removalEnd < replaced.endIndex, replaced[removalEnd] == "\n" {
                    removalEnd = replaced.index(after: removalEnd)
                }
                var removalStart = beginRange.lowerBound
                while removalStart > replaced.startIndex {
                    let previous = replaced.index(before: removalStart)
                    guard replaced[previous] == "\n" else { break }
                    removalStart = previous
                }
                replaced.replaceSubrange(removalStart..<removalEnd, with: "\n")
            }
            return replaced
        }
        guard let section else { return content }
        if content.isEmpty {
            return section + "\n"
        }
        let separator = content.hasSuffix("\n") ? "\n" : "\n\n"
        return content + separator + section + "\n"
    }
}
