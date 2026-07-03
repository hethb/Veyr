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
        try encoder.encode(payload).write(to: Self.statusFileURL(base: base), options: [.atomic])

        let markdown = VeyrAgentStatusBuilder.markdown(payload: payload)
        try Data(markdown.utf8).write(to: Self.markdownFileURL(base: base), options: [.atomic])
    }

    // MARK: - CLAUDE.md injection (opt-in)

    static let claudeMdSectionBegin = "<!-- veyr:spend-status:begin -->"
    static let claudeMdSectionEnd = "<!-- veyr:spend-status:end -->"

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

    static func claudeMdSection(payload: VeyrAgentStatusPayload) -> String {
        var lines: [String] = []
        lines.append(Self.claudeMdSectionBegin)
        lines.append("## Veyr spend status")
        lines.append("<!-- Auto-updated by Veyr. Do not edit; disable in Veyr settings. -->")
        if let session = payload.currentSession {
            lines.append("- Burn rate: \(VeyrAgentStatusBuilder.usd(session.costPerMinute))/min on \(session.model) " +
                "(session so far: \(VeyrAgentStatusBuilder.usd(session.sessionCostUsd)))")
        }
        if let pct = payload.budget.projectPctUsed {
            lines.append("- Project budget: \(pct)% used" +
                (payload.budget.projectRemainingUsd.map { " (\(VeyrAgentStatusBuilder.usd($0)) left this month)" } ?? ""))
        }
        lines.append("")
        lines.append(payload.agentInstructions)
        lines.append(Self.claudeMdSectionEnd)
        return lines.joined(separator: "\n")
    }

    /// Replaces the marker-delimited section, or appends it at the bottom.
    /// Passing nil removes the section.
    static func replacingManagedSection(in content: String, with section: String?) -> String {
        if let beginRange = content.range(of: Self.claudeMdSectionBegin),
           let endRange = content.range(of: Self.claudeMdSectionEnd, range: beginRange.upperBound..<content.endIndex)
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
