import Foundation

/// Infers a "feature tag" — what the user was working on — from a session's
/// working directory. Manual overrides in `~/.veyr/tag-overrides.json`
/// (project path → tag) win over inference.
public struct FeatureTagInferrer: Sendable {
    public static let untagged = "untagged"

    private static let ignoredComponents: Set<String> = [
        "~", "code", "projects", "src", "dev", "work",
        "Documents", "Desktop", "Users", "home", "repos", "git",
    ]

    /// Overrides keyed by absolute project path (tilde-expanded on load).
    public let overrides: [String: String]

    public init(overrides: [String: String] = [:]) {
        var expanded: [String: String] = [:]
        for (path, tag) in overrides {
            let trimmedTag = tag.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedTag.isEmpty else { continue }
            expanded[Self.normalize(path)] = trimmedTag
        }
        self.overrides = expanded
    }

    /// Loads overrides from `~/.veyr/tag-overrides.json`; missing/invalid file → no overrides.
    public static func loadingOverrides(
        from url: URL = VeyrPaths.tagOverridesFile()) -> FeatureTagInferrer
    {
        guard let data = try? Data(contentsOf: url),
              let dict = try? JSONDecoder().decode([String: String].self, from: data)
        else {
            return FeatureTagInferrer()
        }
        return FeatureTagInferrer(overrides: dict)
    }

    public func inferTag(from projectPath: String?) -> String {
        guard let projectPath, !projectPath.isEmpty else { return Self.untagged }
        let normalized = Self.normalize(projectPath)

        // Exact override, then longest-prefix override (so an override on a repo
        // root also covers sessions started in its subdirectories).
        if let exact = self.overrides[normalized] { return exact }
        if let prefixMatch = self.overrides
            .filter({ normalized.hasPrefix($0.key + "/") })
            .max(by: { $0.key.count < $1.key.count })
        {
            return prefixMatch.value
        }

        let display = normalized.replacingOccurrences(of: NSHomeDirectory(), with: "~")
        let components = display.split(separator: "/").map(String.init)
            .filter { !Self.ignoredComponents.contains($0) }
        let tag = components.last ?? Self.untagged
        return tag.isEmpty ? Self.untagged : tag
    }

    /// Raw overrides dict for the Settings editor (path → tag, as stored on disk).
    public static func loadRawOverrides(
        from url: URL = VeyrPaths.tagOverridesFile()) -> [String: String]
    {
        guard let data = try? Data(contentsOf: url),
              let dict = try? JSONDecoder().decode([String: String].self, from: data)
        else { return [:] }
        return dict
    }

    public static func saveRawOverrides(
        _ overrides: [String: String],
        to url: URL = VeyrPaths.tagOverridesFile()) throws
    {
        VeyrPaths.ensureDirectoryExists(url.deletingLastPathComponent())
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(overrides).write(to: url, options: [.atomic])
    }

    private static func normalize(_ path: String) -> String {
        var normalized = (path as NSString).expandingTildeInPath
        while normalized.count > 1, normalized.hasSuffix("/") {
            normalized.removeLast()
        }
        return normalized
    }
}
